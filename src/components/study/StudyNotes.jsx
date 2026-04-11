import { useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, Save } from "lucide-react";
import { downloadNotesMarkdown } from "@/lib/exporters";

export default function StudyNotes({ courseId, topicId, sessionId }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    await studybridge.entities.Note.create({
      course_id: courseId,
      topic_id: topicId,
      session_id: sessionId,
      title: title.trim() || `Study notes - ${new Date().toLocaleDateString()}`,
      content: content.trim(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setTitle('');
      setContent('');
    }, 2000);
  };

  const handleExport = () => {
    downloadNotesMarkdown(
      `study-notes-${new Date().toISOString().slice(0, 10)}.md`,
      {
        title: title.trim() || "Study notes",
        content: content.trim(),
      },
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <h3 className="text-lg font-semibold mb-4">Session Notes</h3>
      <div className="space-y-3">
        <Input 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          placeholder="Note title (optional)"
          className="font-medium"
        />
        <Textarea 
          value={content} 
          onChange={e => setContent(e.target.value)} 
          placeholder="Write your notes here... Use this space to capture key insights, questions, or connections you notice."
          rows={12}
          className="resize-none"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleExport} disabled={!content.trim()} className="gap-2">
            <Download className="w-4 h-4" /> Export MD
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || saving} className="gap-2">
            {saved ? (
              <><Save className="w-4 h-4" /> Saved!</>
            ) : saving ? (
              'Saving...'
            ) : (
              <><Save className="w-4 h-4" /> Save Note</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
