"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/db/schema";
import { ASSIGNABLE_ROLES, FACILITY_SCOPED_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { FACILITY_TYPE_LABELS } from "@/lib/site";
import {
  changeMembershipAction,
  changePathwayAction,
  createDepartmentAction,
  createFacilityAction,
  inviteStaffAction,
  revokeInvitationAction,
  saveEscalationPolicyAction,
  setUserStatusAction,
} from "@/server/actions/admin";
import { idleState, type ActionState } from "@/server/action-result";

export type FacilityOption = { id: string; name: string };

function useToastAction(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
  onSuccess?: () => void,
) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, idleState);

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Saved.");
      onSuccess?.();
      router.refresh();
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
    // onSuccess identity is intentionally not a dependency: it is a closure
    // over a setState that never changes behaviour between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  return { state, formAction, pending };
}

export function InviteStaffDialog({
  organisationId,
  facilities,
  canCreateOrganisationRoles,
}: {
  organisationId: string;
  facilities: FacilityOption[];
  canCreateOrganisationRoles: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<UserRole>("nurse_midwife");
  const { state, formAction, pending } = useToastAction(inviteStaffAction, () => setOpen(false));
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const roles = canCreateOrganisationRoles
    ? ASSIGNABLE_ROLES
    : ASSIGNABLE_ROLES.filter((value) => FACILITY_SCOPED_ROLES.includes(value));
  const needsFacility = FACILITY_SCOPED_ROLES.includes(role);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Invite a colleague
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="organisationId" value={organisationId} />
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>
              They receive a link that is valid for seven days and set their own password. Nothing
              is created until they accept.
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" && !fieldErrors ? (
            <Alert variant="destructive" title="Invitation not sent">
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <div className="grid gap-4">
            <div>
              <Label htmlFor="inviteName" required>
                Full name
              </Label>
              <Input id="inviteName" name="fullName" required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inviteEmail" required>
                Work email address
              </Label>
              <Input id="inviteEmail" name="email" type="email" required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inviteRole" required>
                Role
              </Label>
              <Select name="role" value={role} onValueChange={(value) => setRole(value as UserRole)}>
                <SelectTrigger id="inviteRole" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
            <div>
              <Label htmlFor="inviteFacility" required={needsFacility}>
                Facility
              </Label>
              <Select name="facilityId">
                <SelectTrigger id="inviteFacility" className="mt-1.5">
                  <SelectValue
                    placeholder={
                      needsFacility ? "Choose a facility" : "Leave blank for the whole organisation"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((facility) => (
                    <SelectItem key={facility.id} value={facility.id}>
                      {facility.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors?.facilityId ? (
                <p className="mt-1.5 text-xs text-destructive">{fieldErrors.facilityId[0]}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const { formAction, pending } = useToastAction(revokeInvitationAction);
  return (
    <form action={formAction}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Revoke
      </Button>
    </form>
  );
}

export function UserStatusButton({
  userId,
  organisationId,
  status,
}: {
  userId: string;
  organisationId: string;
  status: string;
}) {
  const { formAction, pending } = useToastAction(setUserStatusAction);
  const suspend = status === "active";
  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="status" value={suspend ? "suspended" : "active"} />
      <Button
        type="submit"
        variant={suspend ? "ghost" : "outline"}
        size="sm"
        loading={pending}
        className={suspend ? "text-destructive hover:bg-coral-50" : undefined}
      >
        {suspend ? "Suspend" : "Reactivate"}
      </Button>
    </form>
  );
}

export function AddRoleDialog({
  userId,
  userName,
  organisationId,
  facilities,
  canCreateOrganisationRoles,
}: {
  userId: string;
  userName: string;
  organisationId: string;
  facilities: FacilityOption[];
  canCreateOrganisationRoles: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<UserRole>("nurse_midwife");
  const { formAction, pending } = useToastAction(changeMembershipAction, () => setOpen(false));

  const roles = canCreateOrganisationRoles
    ? ASSIGNABLE_ROLES
    : ASSIGNABLE_ROLES.filter((value) => FACILITY_SCOPED_ROLES.includes(value));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus />
          Add role
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="organisationId" value={organisationId} />
          <input type="hidden" name="operation" value="add" />
          <DialogHeader>
            <DialogTitle>Add a role for {userName}</DialogTitle>
            <DialogDescription>
              A facility role grants access at that facility only.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="addRole" required>
              Role
            </Label>
            <Select name="role" value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger id="addRole" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="addRoleFacility">Facility</Label>
            <Select name="facilityId">
              <SelectTrigger id="addRoleFacility" className="mt-1.5">
                <SelectValue placeholder="Leave blank for the whole organisation" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((facility) => (
                  <SelectItem key={facility.id} value={facility.id}>
                    {facility.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveRoleButton({
  userId,
  organisationId,
  role,
  facilityId,
}: {
  userId: string;
  organisationId: string;
  role: UserRole;
  facilityId: string | null;
}) {
  const { formAction, pending } = useToastAction(changeMembershipAction);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="facilityId" value={facilityId ?? ""} />
      <input type="hidden" name="operation" value="remove" />
      <button
        type="submit"
        disabled={pending}
        className="text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Remove ${ROLE_LABELS[role]}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </form>
  );
}

export function CreateFacilityDialog({ organisationId }: { organisationId: string }) {
  const [open, setOpen] = React.useState(false);
  const { state, formAction, pending } = useToastAction(createFacilityAction, () => setOpen(false));
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add facility
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="organisationId" value={organisationId} />
          <DialogHeader>
            <DialogTitle>Add a facility</DialogTitle>
            <DialogDescription>
              Coordinates are optional and are used only to estimate travel distance between
              facilities.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="facilityName" required>
                Name
              </Label>
              <Input id="facilityName" name="name" required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="facilityCode" required>
                Short code
              </Label>
              <Input
                id="facilityCode"
                name="code"
                required
                placeholder="RVC"
                className="mt-1.5 uppercase"
              />
              {fieldErrors?.code ? (
                <p className="mt-1.5 text-xs text-destructive">{fieldErrors.code[0]}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="facilityType" required>
                Type
              </Label>
              <Select name="type" defaultValue="primary_health_clinic">
                <SelectTrigger id="facilityType" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FACILITY_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="facilityDistrict">District</Label>
              <Input id="facilityDistrict" name="district" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="facilityProvince">Province</Label>
              <Input id="facilityProvince" name="province" className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="facilityAddress">Address</Label>
              <Input id="facilityAddress" name="addressLine" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="facilityPhone">Phone</Label>
              <Input id="facilityPhone" name="phone" type="tel" className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="facilityLat">Latitude</Label>
                <Input
                  id="facilityLat"
                  name="latitude"
                  type="number"
                  step="0.000001"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="facilityLng">Longitude</Label>
                <Input
                  id="facilityLng"
                  name="longitude"
                  type="number"
                  step="0.000001"
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add facility
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddDepartmentForm({ facilityId }: { facilityId: string }) {
  const { formAction, pending } = useToastAction(createDepartmentAction);
  const [key, setKey] = React.useState(0);

  return (
    <form
      key={key}
      action={(formData) => {
        formAction(formData);
        setKey((value) => value + 1);
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="facilityId" value={facilityId} />
      <div className="min-w-[10rem] flex-1">
        <Label htmlFor={`dept-${facilityId}`} className="text-xs">
          Department
        </Label>
        <Input id={`dept-${facilityId}`} name="name" required className="mt-1" />
      </div>
      <div className="min-w-[10rem] flex-1">
        <Label htmlFor={`svc-${facilityId}`} className="text-xs">
          Service type
        </Label>
        <Input
          id={`svc-${facilityId}`}
          name="serviceType"
          required
          placeholder="Obstetrics"
          className="mt-1"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Add
      </Button>
    </form>
  );
}

export function PathwayToggle({
  referringFacilityId,
  receivingFacilityId,
  active,
}: {
  referringFacilityId: string;
  receivingFacilityId: string;
  active: boolean;
}) {
  const { formAction, pending } = useToastAction(changePathwayAction);
  return (
    <form action={formAction}>
      <input type="hidden" name="referringFacilityId" value={referringFacilityId} />
      <input type="hidden" name="receivingFacilityId" value={receivingFacilityId} />
      <input type="hidden" name="operation" value={active ? "remove" : "add"} />
      <Button type="submit" size="sm" variant={active ? "subtle" : "ghost"} loading={pending}>
        {active ? "Allowed" : "Allow"}
      </Button>
    </form>
  );
}

export type PolicyValues = {
  acknowledgementDueHours: number;
  urgentAcknowledgementDueHours: number;
  missedAppointmentGraceHours: number;
  followUpDueDays: number;
  contactAttemptsBeforeEscalation: number;
  appointmentReminderLeadHours: number;
};

export function EscalationPolicyForm({
  organisationId,
  facilityId,
  values,
  source,
}: {
  organisationId: string;
  facilityId: string | null;
  values: PolicyValues;
  source: string;
}) {
  const { state, formAction, pending } = useToastAction(saveEscalationPolicyAction);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const fields: { name: keyof PolicyValues; label: string; help: string; max: number }[] = [
    {
      name: "acknowledgementDueHours",
      label: "Routine acknowledgement deadline (hours)",
      help: "A routine referral that is not acknowledged within this time raises a task.",
      max: 720,
    },
    {
      name: "urgentAcknowledgementDueHours",
      label: "Urgent acknowledgement deadline (hours)",
      help: "Applies to urgent and emergency referrals. Must not exceed the routine deadline.",
      max: 720,
    },
    {
      name: "missedAppointmentGraceHours",
      label: "Missed appointment grace period (hours)",
      help: "How long after the appointment time to wait before recording it as missed.",
      max: 336,
    },
    {
      name: "followUpDueDays",
      label: "Follow-up due within (days)",
      help: "How long a follow-up task has before it counts as overdue.",
      max: 180,
    },
    {
      name: "contactAttemptsBeforeEscalation",
      label: "Contact attempts before escalation",
      help: "Unsuccessful attempts allowed before the case is flagged for escalation.",
      max: 20,
    },
    {
      name: "appointmentReminderLeadHours",
      label: "Appointment reminder lead time (hours)",
      help: "How far ahead of a booked visit the reminder message is queued.",
      max: 336,
    },
  ];

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="facilityId" value={facilityId ?? ""} />

      <p className="text-xs text-muted-foreground">
        Current values come from the {source} settings.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name}>
            <Label htmlFor={`${facilityId ?? "org"}-${field.name}`}>{field.label}</Label>
            <Input
              id={`${facilityId ?? "org"}-${field.name}`}
              name={field.name}
              type="number"
              min={1}
              max={field.max}
              defaultValue={values[field.name]}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
            {fieldErrors?.[field.name] ? (
              <p className="mt-1 text-xs text-destructive">{fieldErrors[field.name][0]}</p>
            ) : null}
          </div>
        ))}
      </div>

      <Button type="submit" loading={pending}>
        Save policy
      </Button>
    </form>
  );
}
