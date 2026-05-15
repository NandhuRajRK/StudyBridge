import { useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/ui/rich-text-editor";

const COLORS = ['#3B5BDB', '#1098AD', '#37B24D', '#F59F00', '#E64980', '#7950F2', '#FD7E14', '#495057'];

export default function CreateCourseDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', code: '', term: 'Spring 2026', instructor: '', description: '', color: '#3B5BDB', exam_date: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = { ...form };
      if (data.exam_date) data.exam_date = new Date(data.exam_date).toISOString();
      else delete data.exam_date;
      const created = await studybridge.entities.Course.create(data);
      setForm({ title: '', code: '', term: 'Spring 2026', instructor: '', description: '', color: '#3B5BDB', exam_date: '' });
      onCreated(created);
    } catch (error) {
      console.error("Failed to create course", error);
      window.alert(error.message || "Failed to create course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Course Name *</Label>
              <Input 
                value={form.title} 
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                placeholder="Introduction to Computer Science"
              />
            </div>
            <div>
              <Label>Course Code</Label>
              <Input 
                value={form.code} 
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} 
                placeholder="CS101"
              />
            </div>
            <div>
              <Label>Term</Label>
              <Input 
                value={form.term} 
                onChange={e => setForm(f => ({ ...f, term: e.target.value }))} 
                placeholder="Spring 2026"
              />
            </div>
            <div>
              <Label>Instructor</Label>
              <Input 
                value={form.instructor} 
                onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} 
                placeholder="Dr. Smith"
              />
            </div>
            <div>
              <Label>Exam Date</Label>
              <Input 
                type="date" 
                value={form.exam_date} 
                onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} 
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <RichTextEditor
              value={form.description}
              onChange={value => setForm(f => ({ ...f, description: value }))}
              placeholder="Brief course description..."
            />
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1.5">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-7 h-7 rounded-full transition-all ${form.color === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setForm(f => ({ ...f, color }))}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Creating...' : 'Create Course'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
