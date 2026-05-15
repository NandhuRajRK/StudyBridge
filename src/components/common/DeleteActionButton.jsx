import { Trash2 } from "lucide-react";
import { confirmAndDelete } from "@/lib/deleteEntity";

export default function DeleteActionButton({
  entityName,
  item,
  label = "item",
  onDeleted,
  className = "text-muted-foreground hover:text-destructive transition-colors",
  iconClassName = "w-3.5 h-3.5",
  ariaLabel = "Delete item",
}) {
  const handleClick = async () => {
    try {
      const deleted = await confirmAndDelete(entityName, item, label);
      if (deleted) onDeleted?.();
    } catch (error) {
      console.error("Delete failed", error);
      window.alert(error.message || "Failed to delete item");
    }
  };

  return (
    <button type="button" onClick={handleClick} className={className} aria-label={ariaLabel}>
      <Trash2 className={iconClassName} />
    </button>
  );
}

