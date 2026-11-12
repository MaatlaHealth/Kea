import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { PageHeader } from "@/components/app/app-shell";
import {
  AddRoleDialog,
  InviteStaffDialog,
  RemoveRoleButton,
  RevokeInvitationButton,
  UserStatusButton,
} from "@/components/app/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { facilities, invitations, memberships, users } from "@/db/schema";
import { can, primaryOrganisationId } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/session";
import { AuthorisationError } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Staff and roles",
  robots: { index: false, follow: false },
};

export default async function StaffPage() {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");

  const canCreateOrganisationRoles =
    ctx.isPlatformAdmin ||
    ctx.memberships.some(
      (membership) =>
        membership.organisationId === organisationId &&
        membership.facilityId === null &&
        membership.role === "organisation_admin",
    );

  const [rows, pendingInvitations, facilityOptions] = await Promise.all([
    db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        mfaEnabledAt: users.mfaEnabledAt,
        membershipRole: memberships.role,
        membershipFacilityId: memberships.facilityId,
        facilityName: facilities.name,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(facilities, eq(facilities.id, memberships.facilityId))
      .where(and(eq(memberships.organisationId, organisationId), eq(memberships.isActive, true)))
      .orderBy(asc(users.fullName)),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        fullName: invitations.fullName,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        facilityName: facilities.name,
      })
      .from(invitations)
      .leftJoin(facilities, eq(facilities.id, invitations.facilityId))
      .where(
        and(
          eq(invitations.organisationId, organisationId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(asc(invitations.createdAt)),
    db
      .select({ id: facilities.id, name: facilities.name })
      .from(facilities)
      .where(and(eq(facilities.organisationId, organisationId), eq(facilities.isActive, true)))
      .orderBy(asc(facilities.name)),
  ]);

  const grouped = new Map<
    string,
    {
      userId: string;
      fullName: string;
      email: string;
      status: string;
      lastLoginAt: Date | null;
      mfaEnabledAt: Date | null;
      roles: { role: (typeof rows)[number]["membershipRole"]; facilityId: string | null; facilityName: string | null }[];
    }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.userId);
    const roleEntry = {
      role: row.membershipRole,
      facilityId: row.membershipFacilityId,
      facilityName: row.facilityName,
    };
    if (existing) {
      existing.roles.push(roleEntry);
    } else {
      grouped.set(row.userId, {
        userId: row.userId,
        fullName: row.fullName,
        email: row.email,
        status: row.status,
        lastLoginAt: row.lastLoginAt,
        mfaEnabledAt: row.mfaEnabledAt,
        roles: [roleEntry],
      });
    }
  }

  const staff = Array.from(grouped.values());
  const canManage = can(ctx, "user:manage", { organisationId });

  return (
    <>
      <PageHeader
        title="Staff and roles"
        description="Roles are granted either across the organisation or at one facility. A facility role grants nothing elsewhere."
        actions={
          canManage ? (
            <InviteStaffDialog
              organisationId={organisationId}
              facilities={facilityOptions}
              canCreateOrganisationRoles={canCreateOrganisationRoles}
            />
          ) : null
        }
      />

      {pendingInvitations.length > 0 ? (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              An invitation creates nothing until the person accepts it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.fullName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invitation.email}
                    </TableCell>
                    <TableCell className="text-xs">{ROLE_LABELS[invitation.role]}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invitation.facilityName ?? "Whole organisation"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(invitation.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? <RevokeInvitationButton invitationId={invitation.id} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <EmptyState
              title="No staff yet"
              description="Invite your first colleague to get started."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Last sign in</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((person) => (
                  <TableRow key={person.userId}>
                    <TableCell>
                      <span className="block font-medium text-foreground">{person.fullName}</span>
                      <span className="block text-xs text-muted-foreground">{person.email}</span>
                      {person.status !== "active" ? (
                        <Badge variant="warning" className="mt-1">
                          {person.status}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ul className="space-y-1">
                        {person.roles.map((role) => (
                          <li
                            key={`${role.role}-${role.facilityId ?? "org"}`}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Badge variant="neutral">{ROLE_LABELS[role.role]}</Badge>
                            <span className="text-muted-foreground">
                              {role.facilityName ?? "Whole organisation"}
                            </span>
                            {canManage && person.userId !== ctx.userId ? (
                              <RemoveRoleButton
                                userId={person.userId}
                                organisationId={organisationId}
                                role={role.role}
                                facilityId={role.facilityId}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="text-xs">
                      {person.mfaEnabledAt ? (
                        <span className="text-teal-700">Multifactor on</span>
                      ) : (
                        <span className="text-muted-foreground">Password only</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {person.lastLoginAt ? formatDate(person.lastLoginAt) : "Never"}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <AddRoleDialog
                            userId={person.userId}
                            userName={person.fullName}
                            organisationId={organisationId}
                            facilities={facilityOptions}
                            canCreateOrganisationRoles={canCreateOrganisationRoles}
                          />
                          {person.userId !== ctx.userId ? (
                            <UserStatusButton
                              userId={person.userId}
                              organisationId={organisationId}
                              status={person.status}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
