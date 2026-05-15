import { GraduationCap, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, SearchableOptionInput, Section } from "@/components/settings/SettingsFormParts";

export default function SettingsProfileTab({
  t,
  form,
  setForm,
  supportedLanguages,
  universityOptions,
  majorOptions,
}) {
  return (
    <>
      <Section icon={User} title={t("settings.profile")} id="profile">
        <div className="space-y-4">
          <Field label="Full Name">
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="name@university.edu"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="University">
              <SearchableOptionInput
                listId="settings-university-options"
                value={form.university}
                onChange={(value) => setForm(f => ({ ...f, university: value }))}
                options={universityOptions}
                placeholder="Type to search or enter manually"
              />
            </Field>
            <Field label="Major">
              <SearchableOptionInput
                listId="settings-major-options"
                value={form.major}
                onChange={(value) => setForm(f => ({ ...f, major: value }))}
                options={majorOptions}
                placeholder="Type to search or enter manually"
              />
            </Field>
          </div>
          <Field label="Academic Year">
            <Select value={form.year} onValueChange={v => setForm(f => ({ ...f, year: v }))}>
              <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Freshman (Year 1)</SelectItem>
                <SelectItem value="2">Sophomore (Year 2)</SelectItem>
                <SelectItem value="3">Junior (Year 3)</SelectItem>
                <SelectItem value="4">Senior (Year 4)</SelectItem>
                <SelectItem value="grad">Graduate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.language")}>
            <Select value={form.preferred_language} onValueChange={v => setForm(f => ({ ...f, preferred_language: v }))}>
              <SelectTrigger><SelectValue placeholder={t("settings.language")} /></SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((item) => (
                  <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.translationNotice")}
            </p>
          </Field>
        </div>
      </Section>

      <Section icon={GraduationCap} title={t("settings.studyGoals")}>
        <Field label={`${t("settings.dailyGoal")}: ${form.daily_goal_minutes} minutes`}>
          <input
            type="range" min={15} max={300} step={15}
            value={form.daily_goal_minutes}
            onChange={e => setForm(f => ({ ...f, daily_goal_minutes: parseInt(e.target.value) }))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>15m</span><span>1h</span><span>2h</span><span>3h</span><span>5h</span>
          </div>
        </Field>
      </Section>
    </>
  );
}

