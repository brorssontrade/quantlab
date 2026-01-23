/**
 * TextModal.tsx
 *
 * TV-20.3/20.4: Text Tool Modal
 *
 * Modal for editing text annotation content.
 * Opens when text tool creates a new annotation or when editing existing.
 * Features:
 * - Textarea input field (multiline support)
 * - Enter = Save, Shift+Enter = new line
 * - Save/Cancel buttons
 * - data-testid attributes for testing
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface TextModalProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function TextModal({ initialContent, onSave, onCancel }: TextModalProps) {
  const [content, setContent] = useState(initialContent);

  // Reset content when modal opens with new initial value
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSave(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter = Save (unless Shift is held for newline)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <Card 
      className="w-full max-w-md bg-zinc-900 border-zinc-700"
      data-testid="text-modal"
    >
      <CardHeader className="pb-3">
        <CardTitle id="modal-title" className="text-lg font-semibold text-zinc-100">
          Edit Text
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text-content" className="text-zinc-300">
              Text Content
            </Label>
            <p className="text-xs text-zinc-500">
              Enter to save, Shift+Enter for new line
            </p>
            <Textarea
              id="text-content"
              data-testid="text-modal-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter annotation text..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 min-h-[100px] resize-y"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              data-testid="text-modal-cancel"
              onClick={onCancel}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="text-modal-save"
              disabled={!content.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
