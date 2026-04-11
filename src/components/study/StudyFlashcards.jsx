import { useState } from "react";
import { RotateCcw, ChevronLeft, ChevronRight, Check, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownContent from "@/components/ui/markdown-content";
import { downloadFlashcardsAnki } from "@/lib/exporters";

export default function StudyFlashcards({ cards }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState({});

  if (!cards || cards.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">No flashcards available.</div>;
  }

  const card = cards[currentIndex];
  const total = cards.length;
  const correct = Object.values(results).filter(r => r === 'correct').length;

  const handleResult = (result) => {
    setResults(prev => ({ ...prev, [currentIndex]: result }));
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
    <div className="p-6 lg:p-8 max-w-xl mx-auto">
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
          <Button onClick={() => { setCurrentIndex(0); setFlipped(false); setResults({}); }} className="gap-2">
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
    </div>
  );
}
