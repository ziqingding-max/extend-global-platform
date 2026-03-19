import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface BankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  swiftCode?: string;
  iban?: string;
  routingNumber?: string; // US
  bsbCode?: string; // AU
  sortCode?: string; // UK
  ifscCode?: string; // IN
  branchCode?: string;
  currency: string;
  country: string;
  address?: string; // Bank address
}

interface BankDetailsFormProps {
  value: Partial<BankDetails>;
  onChange: (value: Partial<BankDetails>) => void;
  countryCode?: string; // If provided, adapts fields to country specifics
  currency?: string; // If provided, pre-fills currency
  readOnly?: boolean;
}

export function BankDetailsForm({ value, onChange, countryCode, currency, readOnly = false }: BankDetailsFormProps) {

  // Auto-fill currency if provided and not set
  useEffect(() => {
    if (currency && !value.currency) {
      onChange({ ...value, currency });
    }
  }, [currency]);

  // Auto-fill country if provided and not set
  useEffect(() => {
    if (countryCode && !value.country) {
      onChange({ ...value, country: countryCode });
    }
  }, [countryCode]);

  const handleChange = (field: keyof BankDetails, val: string) => {
    if (readOnly) return;
    onChange({ ...value, [field]: val });
  };

  // Determine region-specific fields
  const isUS = countryCode === "US";
  const isUK = countryCode === "GB";
  const isAU = countryCode === "AU";
  const isIN = countryCode === "IN";
  const isEU = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "PT", "FI"].includes(countryCode || "");
  const isCN = countryCode === "CN";

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Bank Details
          {readOnly && <span className="text-xs font-normal text-muted-foreground">(Read Only)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account Holder & Bank Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Account Holder Name *</Label>
            <Input 
              value={value.accountHolderName || ""} 
              onChange={(e) => handleChange("accountHolderName", e.target.value)}
              placeholder="e.g. John Doe"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Name *</Label>
            <Input 
              value={value.bankName || ""} 
              onChange={(e) => handleChange("bankName", e.target.value)}
              placeholder="e.g. Chase Bank"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Account Number / IBAN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{isEU || isUK ? "IBAN" : "Account Number"} *</Label>
            <Input 
              value={isEU || isUK ? (value.iban || "") : (value.accountNumber || "")} 
              onChange={(e) => isEU || isUK ? handleChange("iban", e.target.value) : handleChange("accountNumber", e.target.value)}
              placeholder={isEU || isUK ? "Starts with country code (e.g. DE...)" : "Numeric account number"}
              disabled={readOnly}
            />
          </div>
          
          {/* SWIFT / BIC - Always relevant for international */}
          <div className="space-y-2">
            <Label>SWIFT / BIC Code {isUS ? "(Optional for Domestic)" : "*"}</Label>
            <Input 
              value={value.swiftCode || ""} 
              onChange={(e) => handleChange("swiftCode", e.target.value)}
              placeholder="8 or 11 characters"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Region Specific Codes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isUS && (
            <div className="space-y-2">
              <Label>ACH / Routing Number *</Label>
              <Input 
                value={value.routingNumber || ""} 
                onChange={(e) => handleChange("routingNumber", e.target.value)}
                placeholder="9 digits"
                disabled={readOnly}
              />
            </div>
          )}

          {isUK && (
            <div className="space-y-2">
              <Label>Sort Code *</Label>
              <Input 
                value={value.sortCode || ""} 
                onChange={(e) => handleChange("sortCode", e.target.value)}
                placeholder="XX-XX-XX"
                disabled={readOnly}
              />
            </div>
          )}

          {isAU && (
            <div className="space-y-2">
              <Label>BSB Code *</Label>
              <Input 
                value={value.bsbCode || ""} 
                onChange={(e) => handleChange("bsbCode", e.target.value)}
                placeholder="XXX-XXX"
                disabled={readOnly}
              />
            </div>
          )}

          {isIN && (
            <div className="space-y-2">
              <Label>IFSC Code *</Label>
              <Input 
                value={value.ifscCode || ""} 
                onChange={(e) => handleChange("ifscCode", e.target.value)}
                placeholder="11 characters"
                disabled={readOnly}
              />
            </div>
          )}

          {isCN && (
            <div className="space-y-2">
              <Label>CNAPS Code (Optional)</Label>
              <Input 
                value={value.branchCode || ""} 
                onChange={(e) => handleChange("branchCode", e.target.value)}
                placeholder="For RMB transfers"
                disabled={readOnly}
              />
            </div>
          )}
        </div>

        {/* Bank Address (Optional but recommended for international) */}
        <div className="space-y-2">
          <Label>Bank Address (Optional)</Label>
          <Input 
            value={value.address || ""} 
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Branch address"
            disabled={readOnly}
          />
        </div>
      </CardContent>
    </Card>
  );
}