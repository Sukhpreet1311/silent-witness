$PROJECT_ID = "halogen-ethos-499620-v4"
$REGION = "us-east1"
$SERVICE_NAME = "silent-witness-ui"

# Retrieve Agent Runtime ID from deployment_metadata.json
Write-Host "Reading Agent Runtime ID..."
$MetadataFile = Join-Path (Get-Location) "../deployment_metadata.json"
if (Test-Path $MetadataFile) {
    $Metadata = Get-Content $MetadataFile | ConvertFrom-Json
    $AGENT_RUNTIME_ID = $Metadata.remote_agent_runtime_id
} else {
    Write-Host "Warning: deployment_metadata.json not found! You will need to set AGENT_RUNTIME_ID manually."
    $AGENT_RUNTIME_ID = "None"
}

if ($AGENT_RUNTIME_ID -eq "None" -or $AGENT_RUNTIME_ID -eq $null) {
    Write-Error "Error: No valid AGENT_RUNTIME_ID found. Make sure the backend is deployed successfully first."
    exit 1
}

Write-Host "Building frontend image via Cloud Build..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME . --project $PROJECT_ID

Write-Host "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME `
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME `
  --platform managed `
  --region $REGION `
  --allow-unauthenticated `
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,AGENT_RUNTIME_ID=$AGENT_RUNTIME_ID" `
  --project $PROJECT_ID

Write-Host "Retrieving Cloud Run service account..."
$ServiceAccount = gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format="value(spec.template.spec.serviceAccountName)"
Write-Host "Cloud Run Service Account is: $ServiceAccount"

Write-Host "Granting Vertex AI User permissions to Service Account..."
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$ServiceAccount" `
  --role="roles/aiplatform.user" `
  --project $PROJECT_ID

Write-Host "Deployment completed successfully!"
