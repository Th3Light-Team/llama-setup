import spdxSatisfies from 'spdx-satisfies';

// The SPDX expressions that are allowed per tier.
// Note: These are standard open-source licenses.
// Proprietary licenses like "llama3", "llama2", "gemma" will fail these checks
// since they are not standard OSI approved SPDX expressions.
const STRICT_ENTERPRISE_ALLOWED = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'Unlicense'];
const STANDARD_COMMERCIAL_ALLOWED = [...STRICT_ENTERPRISE_ALLOWED, 'GPL-3.0-or-later', 'GPL-3.0-only', 'GPL-2.0-or-later', 'GPL-2.0-only', 'LGPL-3.0-or-later', 'LGPL-3.0-only'];

export type ComplianceLevel = 'unrestricted' | 'standard' | 'strict';

export interface LicenseValidationResult {
  compliant: boolean;
  licenseExtracted: string | null;
  reason?: string;
}

/**
 * Verifies if a given license string (from GGUF metadata or HuggingFace)
 * satisfies the organization's compliance level.
 */
export function verifyLicenseCompliance(modelLicense: string | null | undefined, policy: ComplianceLevel): LicenseValidationResult {
  if (policy === 'unrestricted') {
    return { compliant: true, licenseExtracted: modelLicense || null };
  }
  
  if (!modelLicense) {
    return { 
      compliant: false, 
      licenseExtracted: null, 
      reason: 'No license specified. Fails commercial safety compliance.' 
    };
  }
  
  const allowedArray = policy === 'strict' ? STRICT_ENTERPRISE_ALLOWED : STANDARD_COMMERCIAL_ALLOWED;
  
  try {
    // Check if the model's license satisfies the compliance policy
    const isCompliant = spdxSatisfies(modelLicense, allowedArray);
    return { 
      compliant: isCompliant, 
      licenseExtracted: modelLicense,
      reason: isCompliant ? undefined : `License "${modelLicense}" does not satisfy the ${policy} policy.`
    };
  } catch {
    // If license is proprietary (like "llama3" which isn't in SPDX), 
    // or has invalid syntax, it fails standard open-source compliance checks.
    return { 
      compliant: false, 
      licenseExtracted: modelLicense,
      reason: `License "${modelLicense}" is not a recognized OSI/SPDX open source license.`
    };
  }
}

/**
 * Helper to extract the license string from GGUF parsed metadata.
 */
export function extractLicenseFromMetadata(metadata: Record<string, any> | undefined): string | null {
  if (!metadata) return null;
  
  // GGUF typically stores it in general.license
  const license = metadata['general.license'] || metadata['license'] || null;
  
  // Sometimes it's stored as an array or object in metadata due to parser quirks
  if (typeof license === 'string') return license;
  if (Array.isArray(license) && typeof license[0] === 'string') return license[0];
  
  return null;
}
