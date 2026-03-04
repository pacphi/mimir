import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, X, GripVertical } from "lucide-react";
import type { ShellCard } from "@/types/terminal";
import { Terminal } from "@/components/terminal/Terminal";
import { ShellLabelEditor } from "./ShellLabelEditor";
import { cn } from "@/lib/utils";

interface ShellCarouselProps {
  cards: ShellCard[];
  activeIndex: number;
  onNavigate: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onClose: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onStatusChange: (id: string, status: ShellCard["status"]) => void;
  theme: "dark" | "light";
}

const statusColors: Record<ShellCard["status"], string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  disconnected: "bg-gray-400",
  error: "bg-red-500",
};

function SortablePill({
  card,
  isActive,
  onClick,
}: {
  card: ShellCard;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        isActive
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-3 w-3" />
      </span>
      <span className={cn("h-1.5 w-1.5 rounded-full", statusColors[card.status])} />
      <span className="truncate max-w-[120px]">{card.label}</span>
    </button>
  );
}

export function ShellCarousel({
  cards,
  activeIndex,
  onNavigate,
  onReorder,
  onClose,
  onLabelChange,
  onStatusChange,
  theme,
}: ShellCarouselProps) {
  const activeCard = cards[activeIndex];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = cards.findIndex((c) => c.id === active.id);
      const newIndex = cards.findIndex((c) => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    },
    [cards, onReorder],
  );

  if (!activeCard) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Header: nav + label + status + close */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => onNavigate(activeIndex - 1)}
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <ShellLabelEditor
          label={activeCard.label}
          onChange={(label) => onLabelChange(activeCard.id, label)}
        />

        <span
          className={cn("h-2 w-2 rounded-full", statusColors[activeCard.status])}
          title={activeCard.status}
        />
        <span className="text-xs text-muted-foreground">{activeCard.instanceName}</span>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">
          {activeIndex + 1} / {cards.length}
        </span>

        <button
          type="button"
          onClick={() => onClose(activeCard.id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Close shell"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          type="button"
          disabled={activeIndex === cards.length - 1}
          onClick={() => onNavigate(activeIndex + 1)}
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Terminal viewport — all mounted, only active visible */}
      <div className="relative h-[calc(100vh-340px)] min-h-[300px] rounded-md border overflow-hidden">
        {cards.map((card, i) => (
          <div
            key={card.id}
            className={cn("absolute inset-0", i === activeIndex ? "z-10" : "z-0 invisible")}
          >
            <Terminal
              sessionId={card.sessionId}
              instanceId={card.instanceId}
              theme={theme}
              onStatusChange={(status) => onStatusChange(card.id, status)}
              className="h-full"
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {cards.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onNavigate(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === activeIndex
                  ? "bg-primary"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
              )}
              title={card.label}
            />
          ))}
        </div>
      )}

      {/* Draggable pill strip */}
      {cards.length > 1 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {cards.map((card, i) => (
                <SortablePill
                  key={card.id}
                  card={card}
                  isActive={i === activeIndex}
                  onClick={() => onNavigate(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
