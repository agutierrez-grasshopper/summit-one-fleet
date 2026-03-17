'use server';

import {
  createVendorCatalogClient,
  createTenantVendorClient,
} from '@rocketmanv9/chassis/vendors';

// ---------------------------------------------------------------------------
// Result wrapper — keeps server-action returns serializable & typed
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function err(e: unknown): Err { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }

// ---------------------------------------------------------------------------
// Catalog — read-only (uses createVendorCatalogClient)
// ---------------------------------------------------------------------------

export async function listCatalogVendors(opts?: { industry?: string; activeOnly?: boolean }): Promise<Result<any[]>> {
  try {
    const catalog = createVendorCatalogClient();
    const data = await catalog.list(opts);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function getCatalogVendor(id: string): Promise<Result<any>> {
  try {
    const catalog = createVendorCatalogClient();
    const data = await catalog.getById(id);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function listIndustryTags(): Promise<Result<any[]>> {
  try {
    const catalog = createVendorCatalogClient();
    const data = await catalog.listIndustryTags();
    return ok(data);
  } catch (e) { return err(e); }
}

export async function listCatalogContacts(catalogVendorId: string): Promise<Result<any[]>> {
  try {
    const catalog = createVendorCatalogClient();
    const data = await catalog.listContacts(catalogVendorId);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function listCatalogAddresses(catalogVendorId: string): Promise<Result<any[]>> {
  try {
    const catalog = createVendorCatalogClient();
    const data = await catalog.listAddresses(catalogVendorId);
    return ok(data);
  } catch (e) { return err(e); }
}

// ---------------------------------------------------------------------------
// Tenant vendors — read + write (uses createTenantVendorClient)
// ---------------------------------------------------------------------------

export async function listVendors(
  tenantId: string,
  opts?: { vendorTypeId?: string; customOnly?: boolean; activeOnly?: boolean },
): Promise<Result<any[]>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.list(opts);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function getVendor(tenantId: string, id: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.getById(id);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function createVendor(
  tenantId: string,
  input: {
    name: string;
    vendor_type_id: string;
    account_number?: string;
    payment_terms?: string;
    credit_limit?: number;
    notes?: string;
    tags?: string[];
  },
): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.create(input);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function updateVendor(
  tenantId: string,
  id: string,
  input: {
    name?: string;
    vendor_type_id?: string;
    account_number?: string;
    payment_terms?: string;
    credit_limit?: number;
    notes?: string;
    tags?: string[];
  },
): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.update(id, input);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function deleteVendor(tenantId: string, id: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.softDelete(id);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function adoptVendors(tenantId: string, catalogVendorIds: string[]): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.adopt(catalogVendorIds);
    return ok(data);
  } catch (e) { return err(e); }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function listContacts(tenantId: string, vendorId: string): Promise<Result<any[]>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.listContacts(vendorId);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function createContact(
  tenantId: string,
  vendorId: string,
  input: { name?: string; email?: string; phone?: string; title?: string; is_primary?: boolean },
): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.createContact(vendorId, input);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function deleteContact(tenantId: string, vendorId: string, contactId: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.deleteContact(vendorId, contactId);
    return ok(data);
  } catch (e) { return err(e); }
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function listAddresses(tenantId: string, vendorId: string): Promise<Result<any[]>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.listAddresses(vendorId);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function createAddress(
  tenantId: string,
  vendorId: string,
  input: {
    address_type?: 'billing' | 'shipping' | 'general';
    label?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  },
): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.createAddress(vendorId, input);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function deleteAddress(tenantId: string, vendorId: string, addressId: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.deleteAddress(vendorId, addressId);
    return ok(data);
  } catch (e) { return err(e); }
}

// ---------------------------------------------------------------------------
// Catalog Submissions (tenant side)
// ---------------------------------------------------------------------------

export async function submitToCatalog(
  tenantId: string,
  vendorId: string,
  submitter: { tenantId: string; userId: string; email: string },
  input?: { proposed_description?: string; proposed_industry_tags?: string[] },
): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.submitToCatalog(vendorId, submitter, input);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function getSubmission(tenantId: string, vendorId: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.getSubmission(vendorId);
    return ok(data);
  } catch (e) { return err(e); }
}

export async function withdrawSubmission(tenantId: string, vendorId: string): Promise<Result<any>> {
  try {
    const client = await createTenantVendorClient(tenantId);
    const data = await client.withdrawSubmission(vendorId);
    return ok(data);
  } catch (e) { return err(e); }
}
