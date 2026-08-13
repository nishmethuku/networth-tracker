import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import {
  fetchHouseholds,
  createHousehold,
  fetchHouseholdMembers,
  inviteToHousehold,
  fetchMyInvites,
  acceptInvite,
  leaveHousehold,
  ApiError,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import { HOUSEHOLD_ROLES } from "../constants/enums";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

const buttonStyle = {
  padding: "0.625rem 1.25rem",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--primary)",
  color: "var(--text-inverse)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

function HouseholdCard({ household }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const toast = useToast();

  const { data: members } = useQuery({
    queryKey: ["household-members", household.id],
    queryFn: () => fetchHouseholdMembers(household.id),
  });

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }) => inviteToHousehold(household.id, email, role),
    onSuccess: () => {
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to send invite");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveHousehold(household.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["households"] }),
  });

  const isOwner = household.owner_id === user?.id;
  const myRole = household.my_role || (isOwner ? "owner" : null);
  const canInvite = myRole === "owner" || myRole === "editor";

  return (
    <Card title={household.name} subtitle={isOwner ? "You own this household" : `You: ${myRole}`}>
      <div style={{ marginTop: "1rem" }}>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 600 }}>
          Members ({members?.length || 0})
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1.25rem" }}>
          {(members || []).map((m) => (
            <div key={m.user_id} style={{ fontSize: "0.8125rem", color: "var(--text)" }}>
              {m.user_id === user?.id ? "You" : m.email} — {m.role}
            </div>
          ))}
        </div>

        {canInvite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail.trim()) inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
            }}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email"
              style={{ ...inputStyle, flex: 1, minWidth: "160px" }}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={inputStyle}>
              {HOUSEHOLD_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button type="submit" disabled={inviteMutation.isPending} style={buttonStyle}>
              {inviteMutation.isPending ? "Sending..." : "Invite"}
            </button>
          </form>
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Viewers can't invite new members.
          </p>
        )}

        {!isOwner && (
          <button
            onClick={() => leaveMutation.mutate()}
            disabled={leaveMutation.isPending}
            style={{
              ...buttonStyle,
              background: "var(--danger)",
              width: "100%",
            }}
          >
            {leaveMutation.isPending ? "Leaving..." : "Leave Household"}
          </button>
        )}
      </div>
    </Card>
  );
}

export default function Households() {
  const queryClient = useQueryClient();
  const [newHouseholdName, setNewHouseholdName] = useState("");

  const {
    data: households,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds });

  const { data: invites } = useQuery({ queryKey: ["invites"], queryFn: fetchMyInvites });

  const createMutation = useMutation({
    mutationFn: createHousehold,
    onSuccess: () => {
      setNewHouseholdName("");
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: acceptInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });

  if (isLoading) return <LoadingState message="Loading households..." />;
  if (isError) {
    return (
      <ErrorState
        error={error instanceof ApiError ? error.message : "Failed to load households"}
        onRetry={refetch}
      />
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
        Household
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Share a household with family members. Holdings you assign to a household are visible to
        every member — editors can add and edit them, viewers can only look. Everything else stays
        private to you.
      </p>

      {invites && invites.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
            Pending Invites
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {invites.map((invite) => (
              <Card key={invite.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.9375rem" }}>You've been invited to a household</span>
                  <button
                    onClick={() => acceptMutation.mutate(invite.id)}
                    disabled={acceptMutation.isPending}
                    style={buttonStyle}
                  >
                    Accept
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "2rem" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newHouseholdName.trim()) createMutation.mutate(newHouseholdName.trim());
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            value={newHouseholdName}
            onChange={(e) => setNewHouseholdName(e.target.value)}
            placeholder="New household name (e.g. Smith Family)"
            style={{ ...inputStyle, flex: 1, maxWidth: "320px" }}
          />
          <button type="submit" disabled={createMutation.isPending} style={buttonStyle}>
            {createMutation.isPending ? "Creating..." : "Create Household"}
          </button>
        </form>
      </div>

      {(!households || households.length === 0) ? (
        <EmptyState message="You're not part of any household yet. Create one above." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {households.map((h) => (
            <HouseholdCard key={h.id} household={h} />
          ))}
        </div>
      )}
    </div>
  );
}
