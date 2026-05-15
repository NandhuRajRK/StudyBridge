import { SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, Section } from "@/components/settings/SettingsFormParts";

export default function SettingsAiContextTab({ t, form, setForm }) {
  return (
    <Section icon={SlidersHorizontal} title={t("settings.aiContextLimits")}>
      <p className="text-sm text-muted-foreground">
        These limits control how much course data the AI sees and how many items it tries to generate at once.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Planner items">
          <Input type="number" min={1} max={20} value={form.planner_item_limit} onChange={e => setForm(f => ({ ...f, planner_item_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Courses in context">
          <Input type="number" min={1} max={20} value={form.context_course_limit} onChange={e => setForm(f => ({ ...f, context_course_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Topics per course">
          <Input type="number" min={1} max={20} value={form.context_topic_limit} onChange={e => setForm(f => ({ ...f, context_topic_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Materials per course">
          <Input type="number" min={1} max={20} value={form.context_material_limit} onChange={e => setForm(f => ({ ...f, context_material_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Notes per course">
          <Input type="number" min={1} max={20} value={form.context_note_limit} onChange={e => setForm(f => ({ ...f, context_note_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Sessions per course">
          <Input type="number" min={1} max={20} value={form.context_session_limit} onChange={e => setForm(f => ({ ...f, context_session_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
        <Field label="Tasks per course">
          <Input type="number" min={1} max={20} value={form.context_task_limit} onChange={e => setForm(f => ({ ...f, context_task_limit: parseInt(e.target.value || "0") || 1 }))} />
        </Field>
      </div>
    </Section>
  );
}

