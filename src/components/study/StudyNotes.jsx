import { useEffect, useMemo, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Plus, Save } from "lucide-react";
import { downloadNotesMarkdown } from "@/lib/exporters";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function hasEditorText(value = "") {
  const plain = String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 0;
}

export default function StudyNotes({ courseId, topicId, sessionId }) {
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState("new");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasContent = hasEditorText(content);
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) || null,
    [notes, selectedNoteId],
  );

  useEffect(() => {
    if (!courseId) {
      setNotes([]);
      setSelectedNoteId("new");
      setTitle("");
      setContent("");
      return;
    }

    const loadNotes = async () => {
      setLoadingNotes(true);
      try {
        const all = await studybridge.entities.Note.filter({ course_id: courseId }, "-updated_date", 200);
        const filtered = topicId ? all.filter((note) => !note.topic_id || note.topic_id === topicId) : all;
        setNotes(filtered);
      } finally {
        setLoadingNotes(false);
      }
    };

    loadNotes().catch((error) => console.error("Failed to load notes", error));
  }, [courseId, topicId]);

  useEffect(() => {
    if (selectedNoteId === "new") return;
    if (!selectedNote) {
      setSelectedNoteId("new");
      return;
    }
    setTitle(selectedNote.title || "");
    setContent(selectedNote.content || "");
  }, [selectedNoteId, selectedNote]);

  const startNewNote = () => {
    setSelectedNoteId("new");
    setTitle("");
    setContent("");
  };

  const handleSave = async () => {
    if (!hasContent) return;
    setSaving(true);
    const payload = {
      course_id: courseId,
      topic_id: topicId,
      session_id: sessionId,
      title: title.trim() || `Study notes - ${new Date().toLocaleDateString()}`,
      content,
    };
    let savedNote = null;
    if (selectedNoteId !== "new") {
      savedNote = await studybridge.entities.Note.update(selectedNoteId, payload);
    } else {
      savedNote = await studybridge.entities.Note.create(payload);
      setSelectedNoteId(savedNote?.id || "new");
    }
    if (savedNote?.id) {
      setNotes((prev) => {
        const next = prev.filter((item) => item.id !== savedNote.id);
        return [savedNote, ...next];
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 2000);
  };

  const handleExport = () => {
    downloadNotesMarkdown(
      `study-notes-${new Date().toISOString().slice(0, 10)}.md`,
      {
        title: title.trim() || "Study notes",
        content,
      },
    );
  };

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
      <h3 className="mb-4 text-lg font-semibold">Session Notes</h3>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={selectedNoteId} onValueChange={setSelectedNoteId}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder={loadingNotes ? "Loading notes..." : "Select a saved note"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New note</SelectItem>
            {notes.map((note) => (
              <SelectItem key={note.id} value={note.id}>
                {note.title || `Untitled note (${new Date(note.created_date || Date.now()).toLocaleDateString()})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="gap-2" onClick={startNewNote}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col space-y-3">
        <Input 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          placeholder="Note title (optional)"
          className="font-medium"
        />
        <div className="min-h-0 flex-1">
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Write your notes here... Use this space to capture key insights, questions, or connections you notice."
            className="h-full"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleExport} disabled={!hasContent} className="gap-2">
            <Download className="w-4 h-4" /> Export MD
          </Button>
          <Button onClick={handleSave} disabled={!hasContent || saving} className="gap-2">
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
    </div>
  );
}
