import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/lib/locale";

export default function AiAccessNotice({ title, message }) {
  const { t } = useLocale();

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="space-y-2">
        <div>
          <p className="font-medium">{title || t("ai.notConfigured")}</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/settings" className="text-sm font-medium text-primary hover:underline">
            {t("ai.openSettings")}
          </Link>
        </div>
      </div>
    </div>
  );
}
