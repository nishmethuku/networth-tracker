import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useHousehold } from "../contexts/HouseholdContext";
import {
  fetchHouseholdMembers,
  createHousehold,
  inviteToHousehold,
  fetchMyInvites,
  acceptInvite,
  leaveHousehold,
  removeHouseholdMember,
  deleteHousehold,
  ApiError,
} from "../api";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};

const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

function RoleBadge({ role }) {
  const colors = {
    owner: { bg: "var(--primary-light)", fg: "var(--primary-dark)" },
    editor: { bg: "var(--success-light)", fg: "var(--success)" },
    viewer: { bg: "var(--bg-secondary)", fg: "var(--text-secondary)" },
  };
  const c = colors[role] || colors.viewer;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.15rem 0.5rem",
        borderRadius: "999px",
        textTransform: "capitalize",
      }}
    >
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function CreateHouseholdCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => createHousehold(name.trim()),
    onSuccess: (household) => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
      toast.success(`${household.name} created`);
      setName("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create household"),
  });

  return (
    <Card title="Create a household">
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Share your net worth data with family — invite members as an editor (can add/edit) or viewer (read-only). You stay in full control:
        any holding can be marked private to keep it out of the shared view entirely.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) mutation.mutate();
        }}
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., The Smith Family"
          aria-label="Household name"
          style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
        />
        <button
          type="submit"
          disabled={!name.trim() || mutation.isPending}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {mutation.isPending ? "Creating..." : "Create Household"}
        </button>
      </form>
    </Card>
  );
}

function InviteForm({ householdId }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");

  const mutation = useMutation({
    mutationFn: () => inviteToHousehold(householdId, email.trim(), role),
    onSuccess: () => {
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to send invite"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) mutation.mutate();
      }}
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email to invite"
        aria-label="Email to invite"
        required
        style={{ ...inputStyle, flex: 1, minWidth: "180px" }}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Invite role" style={inputStyle}>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--text)",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        {mutation.isPending ? "Sending..." : "Invite"}
      </button>
    </form>
  );
}

function HouseholdCard({ household }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { currentHouseholdId, setCurrentHouseholdId } = useHousehold();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isOwner = household.myRole === "owner";
  const canInvite = household.myRole === "owner" || household.myRole === "editor";
  const isViewing = currentHouseholdId === household.id;

  const { data: members, isLoading } = useQuery({
    queryKey: ["household-members", household.id],
    queryFn: () => fetchHouseholdMembers(household.id),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveHousehold(household.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
      if (isViewing) setCurrentHouseholdId(null);
      toast.success(`Left ${household.name}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to leave household"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId) => removeHouseholdMember(household.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["household-members", household.id] });
      toast.success("Member removed");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to remove member"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHousehold(household.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
      if (isViewing) setCurrentHouseholdId(null);
      toast.success(`${household.name} deleted — everyone's data was unshared, nothing was lost`);
      setConfirmingDelete(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete household");
      setConfirmingDelete(false);
    },
  });

  return (
    <Card>
      <ConfirmDeleteModal
        isOpen={confirmingDelete}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmingDelete(false)}
        assetName={household.name}
        title="Delete Household?"
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)" }}>{household.name}</h3>
          <RoleBadge role={household.myRole} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => setCurrentHouseholdId(isViewing ? null : household.id)}
            style={{
              padding: "0.4rem 0.875rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: isViewing ? "var(--primary)" : "var(--card)",
              color: isViewing ? "var(--text-inverse)" : "var(--text)",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
          >
            {isViewing ? "✓ Viewing this household" : "View this household"}
          </button>
          {isOwner ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              style={{
                padding: "0.4rem 0.875rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--danger)",
                cursor: "pointer",
                fontSize: "0.8125rem",
              }}
            >
              Delete
            </button>
          ) : (
            <button
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              style={{
                padding: "0.4rem 0.875rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--danger)",
                cursor: "pointer",
                fontSize: "0.8125rem",
              }}
            >
              Leave
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Members</div>
        {isLoading ? (
          <LoadingState message="Loading members..." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(members || []).map((m) => (
              <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.875rem" }}>
                <span style={{ color: "var(--text)" }}>
                  {m.email}
                  {m.userId === user?.id ? " (you)" : ""}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <RoleBadge role={m.role} />
                  {isOwner && m.userId !== user?.id && (
                    <button
                      onClick={() => removeMutation.mutate(m.userId)}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canInvite && <InviteForm householdId={household.id} />}
    </Card>
  );
}

function PendingInvites() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: invites, isLoading } = useQuery({ queryKey: ["my-invites"], queryFn: fetchMyInvites });

  const acceptMutation = useMutation({
    mutationFn: (inviteId) => acceptInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-invites"] });
      queryClient.invalidateQueries({ queryKey: ["households"] });
      toast.success("Invite accepted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to accept invite"),
  });

  if (isLoading || !invites || invites.length === 0) return null;

  return (
    <Card title="Pending invites">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {invites.map((inv) => (
          <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--text)" }}>
              Invited as <RoleBadge role={inv.role} />
            </span>
            <button
              onClick={() => acceptMutation.mutate(inv.id)}
              disabled={acceptMutation.isPending}
              style={{
                padding: "0.4rem 0.875rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--success)",
                color: "white",
                cursor: "pointer",
                fontSize: "0.8125rem",
                fontWeight: 600,
              }}
            >
              Accept
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Household() {
  const { households, loading } = useHousehold();

  if (loading) return <LoadingState message="Loading households..." />;

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Household</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Share your net worth data with family, or view what's been shared with you.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <PendingInvites />

        {households.length === 0 ? (
          <EmptyState message="You're not part of a household yet." />
        ) : (
          households.map((h) => <HouseholdCard key={h.id} household={h} />)
        )}

        <CreateHouseholdCard />
      </div>
    </div>
  );
}
