"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, AlertCircle, Trash2, Plus, X, type LucideIcon } from "lucide-react";

export interface ManualCredentialField {
  /** Object key used to store the value in the credentials JSONB. */
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password";
  icon: LucideIcon;
  helpText: string;
  /** If true, the field must be filled before saving. Defaults to true. */
  required?: boolean;
}

export interface ManualSetupStep {
  title: string;
  detail: string;
}

export interface ManualPlatformDefinition {
  /** Lowercase platform slug (e.g. "instagram"). */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  fields: ManualCredentialField[];
  setupGuide: ManualSetupStep[];
}

export interface PlatformCredential {
  id: string;
  platform: string;
  credentials: Record<string, string>;
  is_active: boolean;
}

interface ManualCredentialsCardProps {
  platform: ManualPlatformDefinition;
  /** Currently saved credentials list for this platform (tokens are masked). */
  initialCredentials: PlatformCredential[];
}

/**
 * Settings card for platforms that use manual long-lived token entry rather
 * than a full OAuth redirect flow (Instagram).
 *
 * Supports managing multiple connected accounts.
 */
export function ManualCredentialsCard({
  platform,
  initialCredentials,
}: ManualCredentialsCardProps) {
  const [accounts, setAccounts] = useState<PlatformCredential[]>(() => [...initialCredentials]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCredentials, setNewCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const supabase = createClient();

  function updateField(key: string, value: string): void {
    setNewCredentials((prev) => ({ ...prev, [key]: value }));
    if (status) setStatus(null);
  }

  async function handleAddAccount(): Promise<void> {
    const requiredFields = platform.fields.filter((f) => f.required !== false);
    const hasMissing = requiredFields.some((f) => !newCredentials[f.key]?.trim());

    if (hasMissing) {
      setStatus({ type: "error", message: "All fields must be filled before saving." });
      return;
    }

    setSaving(true);
    setStatus(null);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setSaving(false);
      setStatus({
        type: "error",
        message: "Your session could not be verified. Refresh the page and sign in again.",
      });
      return;
    }

    // Insert new credential row
    const { data, error } = await supabase
      .from("platform_credentials")
      .insert({
        user_id: user.id,
        platform: platform.id,
        credentials: newCredentials,
        is_active: true,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      setStatus({ type: "error", message: error.message });
    } else {
      // Mask token before pushing to state
      const maskedCreds = { ...newCredentials };
      if (typeof maskedCreds.access_token === "string" && maskedCreds.access_token) {
        maskedCreds.access_token = `${maskedCreds.access_token.slice(0, 8)}${"*".repeat(20)}`;
      }

      const newAccountObj: PlatformCredential = {
        id: data.id,
        platform: platform.id,
        credentials: maskedCreds,
        is_active: true,
      };

      setAccounts((prev) => [...prev, newAccountObj]);
      setNewCredentials({});
      setShowAddForm(false);
      setStatus({ type: "success", message: "Account added successfully." });
    }
  }

  async function handleDeleteAccount(id: string): Promise<void> {
    if (!confirm("Are you sure you want to disconnect this account?")) {
      return;
    }

    setDeletingId(id);
    setStatus(null);

    const { error } = await supabase
      .from("platform_credentials")
      .delete()
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      setStatus({ type: "error", message: error.message });
    } else {
      setAccounts((prev) => prev.filter((acc) => acc.id !== id));
      setStatus({ type: "success", message: "Account disconnected successfully." });
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
              <platform.icon size={20} strokeWidth={1.8} className="text-foreground" />
            </div>
            <div>
              <CardTitle>{platform.name}</CardTitle>
              <CardDescription>{platform.description}</CardDescription>
            </div>
          </div>
          <Badge variant={accounts.length > 0 ? "success" : "default"} className="whitespace-nowrap">
            {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"} Connected
          </Badge>
        </div>
      </CardHeader>

      <div className="space-y-6">
        {/* Setup guide */}
        <details className="rounded-md border border-border px-3 py-2 bg-surface/50">
          <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
            How to get these credentials
          </summary>
          <ol className="mt-2 space-y-2 text-sm text-text-muted list-decimal list-inside">
            {platform.setupGuide.map((step) => (
              <li key={step.title}>
                <span className="text-foreground font-medium">{step.title}:</span>{" "}
                {step.detail}
              </li>
            ))}
          </ol>
        </details>

        {/* Connected Accounts List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          {accounts.length === 0 ? (
            <p className="text-xs text-text-muted italic bg-surface-elevated/40 p-4 rounded-lg border border-dashed border-border text-center">
              No accounts connected. Add an account below to start posting.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => {
                const name = acc.credentials.account_name || "Instagram Account";
                const accId = acc.credentials.account_id || "No ID";
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-elevated/50 hover:bg-surface-elevated transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{name}</span>
                        {acc.is_active && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5 font-mono truncate">
                        ID: {accId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-text-muted hover:text-error hover:bg-error/10 h-8 w-8 !p-0 flex-shrink-0"
                      onClick={() => handleDeleteAccount(acc.id)}
                      disabled={deletingId === acc.id}
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status feedback */}
        {status && (
          <div
            className={`flex items-center gap-2 text-sm p-2 rounded ${
              status.type === "success" ? "text-success bg-success/5 border border-success/10" : "text-error bg-error/5 border border-error/10"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle size={14} strokeWidth={1.8} />
            ) : (
              <AlertCircle size={14} strokeWidth={1.8} />
            )}
            {status.message}
          </div>
        )}

        {/* Add Account Section */}
        {!showAddForm ? (
          <Button
            variant="secondary"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => {
              setShowAddForm(true);
              setStatus(null);
            }}
          >
            <Plus size={16} strokeWidth={1.8} />
            Add Instagram Account
          </Button>
        ) : (
          <div className="p-4 rounded-xl border border-border bg-surface-elevated/30 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">New Instagram Account</span>
              <Button
                variant="ghost"
                className="h-6 w-6 !p-0 text-text-muted hover:text-foreground"
                onClick={() => setShowAddForm(false)}
              >
                <X size={14} />
              </Button>
            </div>

            {/* Form Fields */}
            {platform.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Input
                  id={`${platform.id}-new-${field.key}`}
                  label={field.label}
                  type={field.type}
                  placeholder={field.placeholder}
                  icon={field.icon}
                  value={newCredentials[field.key] ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
                <p className="text-[10px] text-text-muted mt-0.5">{field.helpText}</p>
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowAddForm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddAccount}
                loading={saving}
              >
                Save Account
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
