import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function Section({ icon: Icon, title, children, id }) {
  return (
    <div id={id} className="space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function SearchableOptionInput({ listId, value, onChange, options, placeholder }) {
  return (
    <div className="space-y-1.5">
      <Input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        Type to search suggestions, or keep typing and press Enter to save your own value.
      </p>
    </div>
  );
}

export function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

