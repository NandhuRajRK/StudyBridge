import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import MarkdownContent from "@/components/ui/markdown-content";

export default function StudyQuiz({ questions }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [results, setResults] = useState([]);

  if (!questions || questions.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">No quiz questions available.</div>;
  }

  const allDone = results.length === questions.length;
  const correctCount = results.filter(r => r).length;

  if (allDone) {
    return (
      <div className="p-6 lg:p-8 max-w-xl mx-auto text-center py-12">
        <h3 className="text-xl font-semibold mb-2">Quiz Complete!</h3>
        <p className="text-3xl font-bold text-primary mb-2">{correctCount}/{questions.length}</p>
        <p className="text-muted-foreground mb-6">{Math.round(correctCount / questions.length * 100)}% correct</p>
        <Button onClick={() => { setCurrentIndex(0); setSelectedAnswer(null); setShowExplanation(false); setResults([]); }} className="gap-2">
          <RotateCcw className="w-4 h-4" /> Try Again
        </Button>
      </div>
    );
  }

  const q = questions[currentIndex];

  const handleAnswer = (answer) => {
    setSelectedAnswer(answer);
    setShowExplanation(true);
    setResults(prev => [...prev, answer === q.correct]);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-muted-foreground">Question {currentIndex + 1} of {questions.length}</span>
        <span className="text-sm text-muted-foreground">{correctCount} correct</span>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 mb-6">
        {questions.map((_, i) => (
          <div 
            key={i} 
            className={`h-1 flex-1 rounded-full ${
              i < results.length ? (results[i] ? 'bg-success' : 'bg-destructive') :
              i === currentIndex ? 'bg-primary' : 'bg-muted'
            }`} 
          />
        ))}
      </div>

      <div className="text-lg font-medium mb-4">
        <MarkdownContent compact>{q.question}</MarkdownContent>
      </div>

      <div className="space-y-2">
        {q.options?.map((option, i) => {
          const isSelected = selectedAnswer === option;
          const isCorrect = option === q.correct;
          const answered = selectedAnswer !== null;

          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => handleAnswer(option)}
              className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${
                answered
                  ? isCorrect
                    ? 'border-success bg-success/5 text-success'
                    : isSelected
                      ? 'border-destructive bg-destructive/5 text-destructive'
                      : 'border-border opacity-50'
                  : 'border-border hover:border-primary hover:bg-primary/5 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                {answered && isCorrect && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                {answered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                <div className="flex-1">
                  <MarkdownContent compact>{option}</MarkdownContent>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showExplanation && q.explanation && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-xs font-medium text-muted-foreground mb-1">Explanation</p>
          <div className="text-sm">
            <MarkdownContent compact>{q.explanation}</MarkdownContent>
          </div>
        </div>
      )}

      {showExplanation && (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleNext} disabled={currentIndex === questions.length - 1 && allDone}>
            {currentIndex === questions.length - 1 ? 'Finish' : 'Next Question'}
          </Button>
        </div>
      )}
    </div>
  );
}
