import { logger } from '../utils/logger.js';

export interface NotificationPayload {
  incidentId: string;
  incidentTitle: string;
  severity: string;
  recipient: { id: string; email: string; displayName: string };
  escalationStep: number;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  public async send(payload: NotificationPayload): Promise<void> {
    logger.info(
      {
        incidentId: payload.incidentId,
        recipientId: payload.recipient.id,
        recipientEmail: payload.recipient.email,
        escalationStep: payload.escalationStep,
        severity: payload.severity,
      },
      `Notification delivered to ${payload.recipient.displayName}: ${payload.incidentTitle}`,
    );
  }
}

export const notificationProvider: NotificationProvider = new ConsoleNotificationProvider();
