-- Household invites need to carry the intended role (editor/viewer) so
-- accepting an invite grants the right access level, not just membership.
alter table public.household_invites
  add column role text not null default 'editor' check (role in ('editor', 'viewer'));
