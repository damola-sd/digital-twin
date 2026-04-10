#!/bin/bash
set -e

ENVIRONMENT=${1:-dev}          # dev | test | prod
PROJECT_NAME=${2:-twin}

echo "🚀 Deploying ${PROJECT_NAME} to ${ENVIRONMENT}..."

# 1. Build Lambda package
cd "$(dirname "$0")/.."        # project root
echo "📦 Building Lambda package..."
(cd backend && uv run deploy.py)

# 2. Terraform init & apply
cd terraform

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# S3 backend region must match the region where twin-terraform-state-* lives (otherwise ListObjects 301).
# If your state bucket is in a different region than DEFAULT_AWS_REGION, set TERRAFORM_STATE_REGION (e.g. eu-north-1).
BACKEND_REGION="${TERRAFORM_STATE_REGION:-${DEFAULT_AWS_REGION:-us-east-1}}"
STATE_BUCKET="twin-terraform-state-${AWS_ACCOUNT_ID}"
# One state key for the whole project; environments are Terraform workspaces (dev / test / prod).
STATE_KEY="${PROJECT_NAME}/terraform.tfstate"

echo "🔧 Initializing Terraform with S3 backend (state bucket region: ${BACKEND_REGION})..."
terraform init -input=false -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="region=${BACKEND_REGION}" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

# One-time recovery: older scripts used backend key "${ENV}/terraform.tfstate" + workspace "${ENV}"
# (S3 object env:/dev/dev/terraform.tfstate) or default workspace at dev/terraform.tfstate.
NEW_STATE_KEY="env:/${ENVIRONMENT}/${STATE_KEY}"
LEGACY_DOUBLE_KEY="env:/${ENVIRONMENT}/${ENVIRONMENT}/terraform.tfstate"
LEGACY_DEFAULT_KEY="${ENVIRONMENT}/terraform.tfstate"
migrate_state_if_needed() {
  if aws s3api head-object --bucket "$STATE_BUCKET" --key "$NEW_STATE_KEY" --region "$BACKEND_REGION" &>/dev/null; then
    return 0
  fi
  if aws s3api head-object --bucket "$STATE_BUCKET" --key "$LEGACY_DOUBLE_KEY" --region "$BACKEND_REGION" &>/dev/null; then
    echo "📦 Migrating Terraform state from legacy path (${LEGACY_DOUBLE_KEY})..."
    aws s3 cp "s3://${STATE_BUCKET}/${LEGACY_DOUBLE_KEY}" "s3://${STATE_BUCKET}/${NEW_STATE_KEY}" --region "$BACKEND_REGION"
    return 0
  fi
  if aws s3api head-object --bucket "$STATE_BUCKET" --key "$LEGACY_DEFAULT_KEY" --region "$BACKEND_REGION" &>/dev/null; then
    echo "📦 Migrating Terraform state from legacy default-workspace path (${LEGACY_DEFAULT_KEY})..."
    aws s3 cp "s3://${STATE_BUCKET}/${LEGACY_DEFAULT_KEY}" "s3://${STATE_BUCKET}/${NEW_STATE_KEY}" --region "$BACKEND_REGION"
    return 0
  fi
}
migrate_state_if_needed

terraform workspace select "$ENVIRONMENT" 2>/dev/null || terraform workspace new "$ENVIRONMENT"

# Use prod.tfvars for production environment
if [ "$ENVIRONMENT" = "prod" ]; then
  TF_APPLY_CMD=(terraform apply -var-file=prod.tfvars -var="project_name=$PROJECT_NAME" -var="environment=$ENVIRONMENT" -auto-approve)
else
  TF_APPLY_CMD=(terraform apply -var="project_name=$PROJECT_NAME" -var="environment=$ENVIRONMENT" -auto-approve)
fi

echo "🎯 Applying Terraform..."
"${TF_APPLY_CMD[@]}"

API_URL=$(terraform output -raw api_gateway_url)
FRONTEND_BUCKET=$(terraform output -raw s3_frontend_bucket)
CUSTOM_URL=$(terraform output -raw custom_domain_url 2>/dev/null || true)

# 3. Build + deploy frontend
cd ../frontend

# Create production environment file with API URL
echo "📝 Setting API URL for production..."
echo "NEXT_PUBLIC_API_URL=$API_URL" > .env.production

npm install
npm run build
aws s3 sync ./out "s3://$FRONTEND_BUCKET/" --delete
cd ..

# 4. Final messages
echo -e "\n✅ Deployment complete!"
echo "🌐 CloudFront URL : $(terraform -chdir=terraform output -raw cloudfront_url)"
if [ -n "$CUSTOM_URL" ]; then
  echo "🔗 Custom domain  : $CUSTOM_URL"
fi
echo "📡 API Gateway    : $API_URL"
