import { useEffect, useRef, useState } from "react";
import { RotateCcw, ChevronLeft, ChevronRight, Check, X, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MarkdownContent from "@/components/ui/markdown-content";
import { downloadFlashcardsAnki } from "@/lib/exporters";

function getSourceIds(item = {}) {
  return Array.isArray(item.source_ids)
    ? item.source_ids
    : Array.isArray(item.sourceIds)
      ? item.sourceIds
      : item.source_id
        ? [item.source_id]
        : [];
}

function getSourceLabel(sourceCatalog = [], sourceId) {
  return sourceCatalog.find((source) => source.id === sourceId)?.label || sourceId;
}

export default function StudyFlashcards({ cards, sourceCatalog = [], onCardResult, onComplete, onCardsChange, openEditorSignal = 0 }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState({});
  const [editorIndex, setEditorIndex] = useState(0);
  const [managing, setManaging] = useState(false);
  const completionSentRef = useRef(false);
  const hasCards = Array.isArray(cards) && cards.length > 0;

  useEffect(() => {
    if (!hasCards) return;
    completionSentRef.current = false;
    setCurrentIndex(0);
    setFlipped(false);
    setResults({});
  }, [hasCards, cards]);

  useEffect(() => {
    if (!openEditorSignal) return;
    setEditorIndex(Math.max(0, cards.length - 1));
    setManaging(true);
  }, [openEditorSignal]);

  useEffect(() => {
    if (!hasCards || Object.keys(results).length !== cards.length || completionSentRef.current) return;
    completionSentRef.current = true;
    onComplete?.({
      cards,
      results,
      correctCount: Object.values(results).filter((item) => item === "correct").length,
    });
  }, [cards, hasCards, onComplete, results]);

  if (!hasCards) {
    return <div className="p-6 text-center text-muted-foreground">No flashcards available.</div>;
  }

  const card = cards[currentIndex];
  const editorCard = cards[Math.max(0, Math.min(editorIndex, cards.length - 1))] || cards[0];
  const total = cards.length;
  const correct = Object.values(results).filter(r => r === 'correct').length;

  const handleResult = (result) => {
    setResults(prev => ({ ...prev, [currentIndex]: result }));
    onCardResult?.({
      card,
      cardIndex: currentIndex,
      result,
      isCorrect: result === "correct",
    });
    if (currentIndex < total - 1) {
      setTimeout(() => {
        setFlipped(false);
        setCurrentIndex(i => i + 1);
      }, 300);
    }
  };

  const allDone = Object.keys(results).length === total;
  const exportAnki = () => {
    downloadFlashcardsAnki(
      `flashcards-${new Date().toISOString().slice(0, 10)}.tsv`,
      cards,
      "StudyBridge",
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-4 flex justify-end">
        <Button
          type="button"
          variant={managing ? "default" : "outline"}
          size="icon"
          aria-label={managing ? "Close card editor" : "Open card editor"}
          onClick={() => setManaging((value) => !value)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      {managing ? (
      <div className="mb-6 rounded-xl border bg-muted/20 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {cards.map((item, index) => (
            <Button
              key={`${index}-${item.front || "card"}`}
              type="button"
              variant={index === editorIndex ? "default" : "outline"}
              size="sm"
              onClick={() => setEditorIndex(index)}
            >
              Card {index + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = [...(cards || []), { front: "", back: "", source_ids: [] }];
              onCardsChange?.(next);
              setEditorIndex(next.length - 1);
            }}
          >
            Add card
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (cards.length <= 1) return;
              const next = cards.filter((_, i) => i !== editorIndex);
              onCardsChange?.(next);
              setEditorIndex(Math.max(0, editorIndex - 1));
            }}
            disabled={cards.length <= 1}
          >
            Remove selected
          </Button>
        </div>
        <Input
          value={editorCard.front || ""}
          placeholder="Front"
          onChange={(event) => {
            const next = cards.map((item, i) => (i === editorIndex ? { ...item, front: event.target.value } : item));
            onCardsChange?.(next);
          }}
        />
        <Textarea
          value={editorCard.back || ""}
          placeholder="Back"
          rows={3}
          onChange={(event) => {
            const next = cards.map((item, i) => (i === editorIndex ? { ...item, back: event.target.value } : item));
            onCardsChange?.(next);
          }}
        />
      </div>
      ) : (
        <>
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-muted-foreground">Card {currentIndex + 1} of {total}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{correct} correct</span>
          <Button variant="ghost" size="sm" onClick={exportAnki} className="gap-2">
            <Download className="w-4 h-4" /> Export Anki
          </Button>
        </div>
      </div>
      <div className="flex gap-1 mb-6">
        {cards.map((_, i) => (
          <div 
            key={i} 
            className={`h-1 flex-1 rounded-full ${
              results[i] === 'correct' ? 'bg-success' : 
              results[i] === 'incorrect' ? 'bg-destructive' : 
              i === currentIndex ? 'bg-primary' : 'bg-muted'
            }`} 
          />
        ))}
      </div>

      {allDone ? (
        <div className="text-center py-12">
          <h3 className="text-xl font-semibold mb-2">Session Complete!</h3>
          <p className="text-muted-foreground mb-4">{correct}/{total} correct</p>
          <Button onClick={() => { completionSentRef.current = false; setCurrentIndex(0); setFlipped(false); setResults({}); }} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Review Again
          </Button>
        </div>
      ) : (
        <>
          {/* Card */}
          <button
            onClick={() => setFlipped(!flipped)}
            className="w-full min-h-[240px] bg-card border rounded-xl p-8 flex items-center justify-center text-center cursor-pointer hover:shadow-md transition-all"
          >
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                {flipped ? 'Answer' : 'Question'}
              </p>
              <div className={`text-lg leading-relaxed ${flipped ? 'font-serif' : 'font-medium'}`}>
                <MarkdownContent compact>{flipped ? card.back : card.front}</MarkdownContent>
              </div>
              {!flipped && (
                <p className="text-xs text-muted-foreground mt-4">Tap to reveal answer</p>
              )}
            </div>
          </button>

          {getSourceIds(card).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {getSourceIds(card).map((sourceId) => (
                <span key={sourceId} className="inline-flex items-center rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                  {getSourceLabel(sourceCatalog, sourceId)}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          {flipped && (
            <div className="flex gap-3 mt-4 justify-center">
              <Button variant="outline" onClick={() => handleResult('incorrect')} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
                <X className="w-4 h-4" /> Didn't Know
              </Button>
              <Button onClick={() => handleResult('correct')} className="gap-2 bg-success hover:bg-success/90">
                <Check className="w-4 h-4" /> Got It
              </Button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button variant="ghost" size="sm" disabled={currentIndex === 0} onClick={() => { setCurrentIndex(i => i - 1); setFlipped(false); }}>
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={currentIndex === total - 1} onClick={() => { setCurrentIndex(i => i + 1); setFlipped(false); }}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
