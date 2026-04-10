#!/bin/bash
set -e

# Check if environment parameter is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Environment parameter is required"
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev"
    echo "Available environments: dev, test, prod"
    exit 1
fi

ENVIRONMENT=$1
PROJECT_NAME=${2:-twin}

echo "🗑️ Preparing to destroy ${PROJECT_NAME}-${ENVIRONMENT} infrastructure..."

# Navigate to terraform directory
cd "$(dirname "$0")/../terraform"

# Get AWS Account ID and Region for backend configuration
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BACKEND_REGION="${TERRAFORM_STATE_REGION:-${DEFAULT_AWS_REGION:-us-east-1}}"
STATE_BUCKET="twin-terraform-state-${AWS_ACCOUNT_ID}"
STATE_KEY="${PROJECT_NAME}/terraform.tfstate"

# Initialize terraform with S3 backend
echo "🔧 Initializing Terraform with S3 backend (state bucket region: ${BACKEND_REGION})..."
terraform init -input=false -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="region=${BACKEND_REGION}" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

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

if ! terraform workspace select "$ENVIRONMENT" 2>/dev/null; then
    echo "❌ Error: Workspace '$ENVIRONMENT' does not exist (nothing to destroy for this environment)."
    terraform workspace list
    exit 1
fi

echo "📦 Emptying S3 buckets..."

# Get bucket names with account ID (matching Day 4 naming)
FRONTEND_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-frontend-${AWS_ACCOUNT_ID}"
MEMORY_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-memory-${AWS_ACCOUNT_ID}"

# Empty frontend bucket if it exists
if aws s3 ls "s3://$FRONTEND_BUCKET" 2>/dev/null; then
    echo "  Emptying $FRONTEND_BUCKET..."
    aws s3 rm "s3://$FRONTEND_BUCKET" --recursive
else
    echo "  Frontend bucket not found or already empty"
fi

# Empty memory bucket if it exists
if aws s3 ls "s3://$MEMORY_BUCKET" 2>/dev/null; then
    echo "  Emptying $MEMORY_BUCKET..."
    aws s3 rm "s3://$MEMORY_BUCKET" --recursive
else
    echo "  Memory bucket not found or already empty"
fi

echo "🔥 Running terraform destroy..."

# Create a dummy lambda zip if it doesn't exist (needed for destroy in GitHub Actions)
if [ ! -f "../backend/lambda-deployment.zip" ]; then
    echo "Creating dummy lambda package for destroy operation..."
    echo "dummy" | zip ../backend/lambda-deployment.zip -
fi

# Run terraform destroy with auto-approve
if [ "$ENVIRONMENT" = "prod" ] && [ -f "prod.tfvars" ]; then
    terraform destroy -var-file=prod.tfvars -var="project_name=$PROJECT_NAME" -var="environment=$ENVIRONMENT" -auto-approve
else
    terraform destroy -var="project_name=$PROJECT_NAME" -var="environment=$ENVIRONMENT" -auto-approve
fi

echo "✅ Infrastructure for ${ENVIRONMENT} has been destroyed!"
echo ""
echo "💡 Remote state: s3://${STATE_BUCKET}/env:/${ENVIRONMENT}/${STATE_KEY} (and any legacy keys you no longer need)."
