"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConsentType } from "@/db/schema";
import { SUPPORTED_LANGUAGES } from "@/lib/site";
import { recordConsentAction, updatePatientAction } from "@/server/actions/patients";
import { idleState, type ActionState } from "@/server/action-result";

export type EditablePatient = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  alternatePhone: string | null;
  preferredLanguage: string;
  preferredChannel: string;
  residentialArea: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
};

export function PatientEditDialog({ patient }: { patient: EditablePatient }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePatientAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Record updated.");
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="patientId" value={patient.id} />
          <DialogHeader>
            <DialogTitle>Edit patient details</DialogTitle>
            <DialogDescription>
              Changes are recorded in the record history with your name and the fields you changed.
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" ? (
            <Alert variant="destructive" title="Not saved">
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="editFirstName">First name</Label>
              <Input
                id="editFirstName"
                name="firstName"
                defaultValue={patient.firstName}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editLastName">Surname</Label>
              <Input
                id="editLastName"
                name="lastName"
                defaultValue={patient.lastName}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editDob">Date of birth</Label>
              <Input
                id="editDob"
                name="dateOfBirth"
                type="date"
                defaultValue={patient.dateOfBirth ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editPhone">Mobile number</Label>
              <Input
                id="editPhone"
                name="phone"
                type="tel"
                defaultValue={patient.phone ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editAltPhone">Alternative number</Label>
              <Input
                id="editAltPhone"
                name="alternatePhone"
                type="tel"
                defaultValue={patient.alternatePhone ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editLanguage">Preferred language</Label>
              <Select name="preferredLanguage" defaultValue={patient.preferredLanguage}>
                <SelectTrigger id="editLanguage" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="editChannel">Contact method</Label>
              <Select name="preferredChannel" defaultValue={patient.preferredChannel}>
                <SelectTrigger id="editChannel" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="voice_callback">Telephone call by staff</SelectItem>
                  <SelectItem value="none">Do not contact by message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="editArea">Area</Label>
              <Input
                id="editArea"
                name="residentialArea"
                defaultValue={patient.residentialArea ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editEmergencyName">Emergency contact name</Label>
              <Input
                id="editEmergencyName"
                name="emergencyContactName"
                defaultValue={patient.emergencyContactName ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editEmergencyPhone">Emergency contact number</Label>
              <Input
                id="editEmergencyPhone"
                name="emergencyContactPhone"
                type="tel"
                defaultValue={patient.emergencyContactPhone ?? ""}
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="editNotes">Notes for staff</Label>
              <Textarea
                id="editNotes"
                name="notes"
                rows={3}
                defaultValue={patient.notes ?? ""}
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="editReason">Reason for this change</Label>
              <Input
                id="editReason"
                name="reason"
                placeholder="For example, patient gave a new number"
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CONSENT_LABELS: Record<ConsentType, { title: string; detail: string }> = {
  data_processing: {
    title: "Record and share for care",
    detail: "Details may be recorded and shared with the facility the patient is referred to.",
  },
  appointment_messaging: {
    title: "Appointment messages",
    detail: "Confirmations and reminders about appointments.",
  },
  follow_up_messaging: {
    title: "Follow-up messages",
    detail: "Contact after a missed visit or when follow-up is due.",
  },
  third_party_sharing: {
    title: "Sharing beyond the care pathway",
    detail: "Any sharing that is not part of this referral pathway.",
  },
};

export function ConsentControls({
  patientId,
  consents,
  canEdit,
}: {
  patientId: string;
  consents: { type: ConsentType; status: string; capturedAt: string; method: string | null }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busyType, setBusyType] = React.useState<ConsentType | null>(null);

  const byType = new Map(consents.map((consent) => [consent.type, consent]));
  const types: ConsentType[] = [
    "data_processing",
    "appointment_messaging",
    "follow_up_messaging",
    "third_party_sharing",
  ];

  const toggle = (type: ConsentType, nextGranted: boolean) => {
    setBusyType(type);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("patientId", patientId);
      formData.set("type", type);
      formData.set("granted", nextGranted ? "true" : "false");
      formData.set("method", "Updated by staff");
      const result = await recordConsentAction(idleState, formData);
      setBusyType(null);
      if (result.status === "success") {
        toast.success(result.message ?? "Consent updated.");
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {types.map((type) => {
          const record = byType.get(type);
          const granted = record?.status === "granted";
          return (
            <li
              key={type}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{CONSENT_LABELS[type].title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {CONSENT_LABELS[type].detail}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {record
                    ? `${granted ? "Granted" : record.status === "withdrawn" ? "Withdrawn" : "Not asked"}${
                        record.method ? ` · ${record.method}` : ""
                      }`
                    : "No record"}
                </p>
              </div>
              <Switch
                checked={granted}
                disabled={!canEdit || (pending && busyType === type)}
                aria-label={`${CONSENT_LABELS[type].title} consent`}
                onCheckedChange={(value) => toggle(type, value === true)}
              />
            </li>
          );
        })}
      </ul>

      {!canEdit ? (
        <p className="text-xs text-muted-foreground">
          Your role does not allow consent changes on this record.
        </p>
      ) : null}
    </div>
  );
}
