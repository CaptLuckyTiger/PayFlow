CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key"
ON "WebhookDelivery"("endpointId", "eventId");
