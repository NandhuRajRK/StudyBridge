import { Bell } from "lucide-react";
import { Section, ToggleRow } from "@/components/settings/SettingsFormParts";

export default function SettingsNotificationsTab({ t, notifications, setNotifications }) {
  return (
    <Section icon={Bell} title={t("settings.notifications")}>
      <div className="space-y-4">
        <ToggleRow
          label={t("settings.studyReminders")}
          description="Daily reminders to study"
          checked={notifications.study_reminders}
          onChange={v => setNotifications(n => ({ ...n, study_reminders: v }))}
        />
        <ToggleRow
          label={t("settings.taskDue")}
          description="Reminders when tasks are due soon"
          checked={notifications.task_due}
          onChange={v => setNotifications(n => ({ ...n, task_due: v }))}
        />
        <ToggleRow
          label={t("settings.weeklySummary")}
          description="Weekly email with your progress"
          checked={notifications.weekly_summary}
          onChange={v => setNotifications(n => ({ ...n, weekly_summary: v }))}
        />
      </div>
    </Section>
  );
}

