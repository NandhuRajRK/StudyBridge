import { useEffect, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichTextEditor from "@/components/ui/rich-text-editor";

const DEFAULT_FORM = {
  title: "",
  type: "study",
  priority: "medium",
  due_date: "",
  course_id: "",
  topic_id: "",
  estimated_minutes: "",
  instructions: "",
  outcome: "",
};

function normalizeInitialValues(initialValues = {}) {
  if (!initialValues || typeof initialValues !== "object") return {};
  return {
    due_date: typeof initialValues.due_date === "string" ? initialValues.due_date : "",
    course_id: typeof initialValues.course_id === "string" ? initialValues.course_id : "",
    topic_id: typeof initialValues.topic_id === "string" ? initialValues.topic_id : "",
    title: typeof initialValues.title === "string" ? initialValues.title : "",
    type: typeof initialValues.type === "string" ? initialValues.type : "study",
    priority: typeof initialValues.priority === "string" ? initialValues.priority : "medium",
    estimated_minutes: initialValues.estimated_minutes ? String(initialValues.estimated_minutes) : "",
    instructions: typeof initialValues.instructions === "string" ? initialValues.instructions : "",
    outcome: typeof initialValues.outcome === "string" ? initialValues.outcome : "",
  };
}

export default function AddTaskDialog({ open, onClose, courses, topics = [], onCreated, initialValues = {} }) {
  const [form, setForm] = useState({
    ...DEFAULT_FORM,
    ...normalizeInitialValues(initialValues),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...DEFAULT_FORM,
      ...normalizeInitialValues(initialValues),
    });
  }, [initialValues, open]);

  const resetForm = () => setForm({
    title: "",
    type: "study",
    priority: "medium",
    due_date: "",
    course_id: "",
    topic_id: "",
    estimated_minutes: "",
    instructions: "",
    outcome: "",
  });

  const courseTopics = topics.filter(t => t.course_id === form.course_id);

  const updateForm = (patch) => setForm(f => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const data = { ...form };
    if (data.due_date) data.due_date = new Date(data.due_date).toISOString();
    else delete data.due_date;
    if (data.estimated_minutes) data.estimated_minutes = parseInt(data.estimated_minutes);
    else delete data.estimated_minutes;
    if (!data.course_id) delete data.course_id;
    if (!data.topic_id) delete data.topic_id;
    if (!data.instructions.trim()) delete data.instructions;
    if (!data.outcome.trim()) delete data.outcome;
    data.status = "todo";

    try {
      await studybridge.entities.Task.create(data);
      resetForm();
      onCreated();
      onClose();
    } catch (error) {
      console.error("Failed to add task", error);
      window.alert(error.message || "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="Review arrays and solve 3 practice problems" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Course</Label>
              <Select value={form.course_id} onValueChange={v => updateForm({ course_id: v, topic_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Optional..." /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic</Label>
              <Select value={form.topic_id} onValueChange={v => updateForm({ topic_id: v })} disabled={!form.course_id || courseTopics.length === 0}>
                <SelectTrigger><SelectValue placeholder={form.course_id ? "Optional..." : "Pick course first"} /></SelectTrigger>
                <SelectContent>
                  {courseTopics.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => updateForm({ type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="study">Study</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="reading">Reading</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => updateForm({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => updateForm({ due_date: e.target.value })} />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={form.estimated_minutes} onChange={e => updateForm({ estimated_minutes: e.target.value })} placeholder="30" />
            </div>
          </div>

          <div>
            <Label>What should I do?</Label>
            <RichTextEditor
              value={form.instructions}
              onChange={(value) => updateForm({ instructions: value })}
              placeholder="Read the summary, make 5 flashcards, then solve 3 practice questions."
            />
          </div>

          <div>
            <Label>Done when</Label>
            <Input value={form.outcome} onChange={e => updateForm({ outcome: e.target.value })} placeholder="I can explain the topic without notes." />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? "Adding..." : "Add Task"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
