import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Loader2 } from "lucide-react";

export default function MaterialUploader({ open, onClose, courseId, topics, onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('pdf');
  const [topicId, setTopicId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Create material record
      const material = await base44.entities.StudyMaterial.create({
        course_id: courseId,
        topic_id: topicId || undefined,
        title: title.trim(),
        type,
        file_url,
        file_name: file.name,
        file_size: file.size,
        status: 'uploaded',
      });

      setUploading(false);
      setProcessing(true);

      const [course] = await base44.entities.Course.filter({ id: courseId }, null, 1);
      const selectedTopic = topics.find(t => t.id === topicId);
      const fallbackSummary = `Uploaded material saved for ${course?.title || "this course"}${selectedTopic?.title ? ` and linked to ${selectedTopic.title}` : ""}. AI summary is unavailable until you enable local Gemma or add a Google API key.`;

      // Process with AI to extract summary and topics
      let summary = {
        summary: fallbackSummary,
        extracted_topics: [],
      };

      try {
        summary = await base44.integrations.Core.InvokeLLM({
          prompt: `You are analyzing metadata for a StudyBridge upload. You cannot read the file contents yet, so do not pretend you did.

Course: ${course?.title || "Unknown"} ${course?.code ? `(${course.code})` : ""}
Selected topic: ${selectedTopic?.title || "None"}
Material title: ${title}
File name: ${file.name}
Material type: ${type}

Based only on this metadata, generate a cautious 2-3 sentence summary and likely key topics. Return as JSON.`,
          response_json_schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              extracted_topics: { type: "array", items: { type: "string" } }
            }
          }
        });
      } catch (error) {
        if (error?.code !== "AI_UNAVAILABLE") {
          console.error("Failed to summarize uploaded material", error);
        }
      }

      await base44.entities.StudyMaterial.update(material.id, {
        status: 'processed',
        summary: summary.summary,
        extracted_topics: summary.extracted_topics,
      });

      setFile(null);
      setTitle('');
      setType('pdf');
      setTopicId('');
      onUploaded();
      onClose();
    } catch (error) {
      console.error("Failed to upload material", error);
      window.alert(error.message || "Failed to upload material");
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Study Material</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* File upload area */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            {file ? (
              <div className="flex items-center gap-3 justify-center">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PDF, PPTX, DOCX, or images</p>
                <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.png,.jpg,.jpeg" />
              </label>
            )}
          </div>

          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Material title" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="slides">Slides</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="reading">Reading</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic (optional)</Label>
              <Select value={topicId} onValueChange={setTopicId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleUpload} 
              disabled={!file || !title.trim() || uploading || processing}
              className="gap-2"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : processing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="w-4 h-4" /> Upload</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
