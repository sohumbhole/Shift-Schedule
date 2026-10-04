import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, Copy, Check, ExternalLink, Bot, Undo2, Loader2, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

function when(iso) {
  if (!iso) return "never";
  try {
    return format(new Date(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export default function ApiAccessCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("Muse");
  const [access, setAccess] = useState("read_write");
  const [newKey, setNewKey] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [confirmUndo, setConfirmUndo] = useState(null);
  const [error, setError] = useState(null);
  const enabled = isSupabaseConfigured();
  const docsUrl = `${window.location.origin}/api/v1/docs`;

  const keysQuery = useQuery({ queryKey: ["apiKeys"], queryFn: () => apiFetch("tokens"), enabled });
  const changesQuery = useQuery({ queryKey: ["apiChanges"], queryFn: () => apiFetch("changes?limit=10"), enabled });

  const createKey = useMutation({
    mutationFn: () => apiFetch("tokens", { method: "POST", body: { name: name.trim() || "Muse", access } }),
    onSuccess: (env) => {
      setNewKey(env.data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
    onError: (e) => setError(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: (id) => apiFetch(`tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmRevoke(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
    onError: (e) => setError(e.message),
  });

  const undoChange = useMutation({
    mutationFn: (id) => apiFetch(`changes/${id}/undo`, { method: "POST", body: {} }),
    onSuccess: () => {
      setConfirmUndo(null);
      setError(null);
      for (const key of ["apiChanges", "shifts", "timeOffs", "events", "employees", "storeSettings"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (e) => setError(e.message),
  });

  if (!enabled) {
    return (
      <Card className="border-gray-100">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Bot className="w-4 h-4 text-orange-500" /> API access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">The API needs the real database; it is not available in mock mode.</CardContent>
      </Card>
    );
  }

  const keys = keysQuery.data?.data?.keys || [];
  const changes = (changesQuery.data?.data?.changes || []).filter((c) => !c.action.startsWith("key."));

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="w-4 h-4 text-orange-500" />
          API access (Muse and other assistants)
        </CardTitle>
        <p className="text-sm text-gray-500">
          An API key lets an assistant like Muse read the schedule and make changes for you, using the same rules as this
          website. Every change it makes is listed below and can be undone.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Docs */}
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api-docs" target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View API docs
            </Button>
          </a>
          <CopyButton text={docsUrl} label="Copy docs link for Muse" />
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* New key, shown once */}
        {newKey && (
          <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4 space-y-3">
            <div className="font-semibold text-orange-900">Your new key "{newKey.name}". Copy it now: it will not be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all rounded bg-white border border-orange-200 px-2.5 py-2 text-xs">{newKey.key}</code>
              <CopyButton text={newKey.key} />
            </div>
            <ol className="list-decimal pl-5 text-sm text-orange-900 space-y-1">
              <li>In Muse, ask it to create a custom connector for this API using the docs link above.</li>
              <li>When Muse asks for the key, paste this key. It is sent as "Authorization: Bearer" and stays in Muse.</li>
              <li>Ask Muse to check the connection ("call GET /me"). It should say the store name and today's date.</li>
            </ol>
            <Button type="button" size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => setNewKey(null)}>
              I copied it
            </Button>
          </div>
        )}

        {/* Create */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">New key name</Label>
            <Input id="api-key-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Muse" />
          </div>
          <div className="space-y-1.5">
            <Label>Access</Label>
            <Select value={access} onValueChange={setAccess}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read_write">Read and write</SelectItem>
                <SelectItem value="read">Read only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => createKey.mutate()} disabled={createKey.isPending} className="gap-1.5 bg-orange-500 hover:bg-orange-600">
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Create key
          </Button>
        </div>

        {/* Keys */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Keys</div>
          {keysQuery.isLoading && <div className="text-sm text-gray-400">Loading...</div>}
          {keysQuery.isError && <div className="text-sm text-red-600">{keysQuery.error.message}</div>}
          {!keysQuery.isLoading && !keysQuery.isError && keys.length === 0 && <div className="text-sm text-gray-400">No keys yet.</div>}
          {keys.map((k) => (
            <div key={k.id} className={"flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2.5 text-sm " + (k.active ? "border-gray-200" : "border-gray-100 bg-gray-50 text-gray-400")}>
              <div className="font-medium text-gray-800">{k.name}</div>
              <code className="text-xs">{k.prefix}...</code>
              <span className={"text-xs rounded-full px-2 py-0.5 " + (k.access === "read" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600")}>
                {k.access === "read" ? "Read only" : "Read and write"}
              </span>
              <span className="text-xs text-gray-500">Created {when(k.created_at)} · Last used {when(k.last_used_at)}</span>
              <div className="ml-auto">
                {!k.active ? (
                  <span className="text-xs">Revoked {when(k.revoked_at)}</span>
                ) : confirmRevoke === k.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-red-600">Revoke? Anything using it stops working.</span>
                    <Button type="button" size="sm" variant="ghost" className="text-red-600" disabled={revokeKey.isPending} onClick={() => revokeKey.mutate(k.id)}>Yes, revoke</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevoke(null)}>No</Button>
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmRevoke(k.id)}>Revoke</Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent changes made through the API */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Recent changes made through the API</div>
          {changesQuery.isLoading && <div className="text-sm text-gray-400">Loading...</div>}
          {changesQuery.isError && <div className="text-sm text-red-600">{changesQuery.error.message}</div>}
          {!changesQuery.isLoading && !changesQuery.isError && changes.length === 0 && <div className="text-sm text-gray-400">None yet.</div>}
          {changes.map((c) => (
            <div key={c.id} className={"flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-100 px-3 py-2 text-sm " + (c.undone_at ? "text-gray-400" : "text-gray-700")}>
              <span className="text-xs text-gray-400 w-28 shrink-0">{when(c.at)}</span>
              <span className={"flex-1 min-w-0 " + (c.undone_at ? "line-through" : "")}>{c.summary}</span>
              <span className="text-xs text-gray-400">{c.actor?.via === "api_key" ? c.actor.key_name : "website"}</span>
              {c.can_undo && (
                confirmUndo === c.id ? (
                  <span className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="ghost" disabled={undoChange.isPending} onClick={() => undoChange.mutate(c.id)}>Yes, undo</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmUndo(null)}>No</Button>
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" className="gap-1 text-gray-500" onClick={() => setConfirmUndo(c.id)}>
                    <Undo2 className="w-3.5 h-3.5" /> Undo
                  </Button>
                )
              )}
              {c.undone_at && <span className="text-xs">undone</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
