import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  /** Defaults to the self-service ids (`apply-business`, `apply-phone`, `apply-license`). */
  idPrefix?: string;
  businessName: string;
  phone: string;
  licenseNumber: string;
  onBusinessNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onLicenseNumberChange: (value: string) => void;
  /**
   * Salesperson Job Boarding adds name, email, and address on top of the
   * contractor application. Omit these handlers and the extra fields stay hidden.
   */
  fullName?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  onFullNameChange?: (value: string) => void;
  onEmailChange?: (value: string) => void;
  onAddress1Change?: (value: string) => void;
  onAddress2Change?: (value: string) => void;
  onCityChange?: (value: string) => void;
  onStateChange?: (value: string) => void;
  onPostalCodeChange?: (value: string) => void;
};

/**
 * Business name, phone, and optional license. Shared by the contractor
 * application and salesperson Job Boarding. The default ids match the
 * contractor self-service form.
 */
export function ContractorApplicationFields({
  idPrefix = "apply",
  businessName,
  phone,
  licenseNumber,
  onBusinessNameChange,
  onPhoneChange,
  onLicenseNumberChange,
  fullName,
  email,
  address1,
  address2,
  city,
  state,
  postalCode,
  onFullNameChange,
  onEmailChange,
  onAddress1Change,
  onAddress2Change,
  onCityChange,
  onStateChange,
  onPostalCodeChange,
}: Props) {
  return (
    <>
      {onFullNameChange && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-name`}>Full name</Label>
          <Input id={`${idPrefix}-name`} value={fullName ?? ""} onChange={(event) => onFullNameChange(event.target.value)} required />
        </div>
      )}
      {onEmailChange && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input id={`${idPrefix}-email`} type="email" value={email ?? ""} onChange={(event) => onEmailChange(event.target.value)} required />
        </div>
      )}
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-business`}>Business name</Label><Input id={`${idPrefix}-business`} value={businessName} onChange={(event) => onBusinessNameChange(event.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-phone`}>Phone</Label><Input id={`${idPrefix}-phone`} value={phone} onChange={(event) => onPhoneChange(event.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-license`}>License (optional)</Label><Input id={`${idPrefix}-license`} value={licenseNumber} onChange={(event) => onLicenseNumberChange(event.target.value)} /></div>
      {onAddress1Change && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-address`}>Street address</Label>
          <Input id={`${idPrefix}-address`} value={address1 ?? ""} onChange={(event) => onAddress1Change(event.target.value)} required />
        </div>
      )}
      {onAddress2Change && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-address2`}>Address line 2 (optional)</Label>
          <Input id={`${idPrefix}-address2`} value={address2 ?? ""} onChange={(event) => onAddress2Change(event.target.value)} />
        </div>
      )}
      {onCityChange && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-city`}>City</Label>
            <Input id={`${idPrefix}-city`} value={city ?? ""} onChange={(event) => onCityChange(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-state`}>State</Label>
            <Input id={`${idPrefix}-state`} value={state ?? ""} onChange={(event) => onStateChange?.(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-postal`}>Postal code</Label>
            <Input id={`${idPrefix}-postal`} value={postalCode ?? ""} onChange={(event) => onPostalCodeChange?.(event.target.value)} required />
          </div>
        </div>
      )}
    </>
  );
}
