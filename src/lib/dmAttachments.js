import { supabase } from './supabase';

export const DM_PRIVATE_BUCKET = 'dm-attachments-private';
const DM_PRIVATE_PREFIX = 'dm-private://';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

const sanitizeFileName = (fileName = 'attachment') => (
  fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'attachment'
);

export const isPrivateDmAttachment = (value) => typeof value === 'string' && value.startsWith(DM_PRIVATE_PREFIX);

export const encodePrivateDmAttachment = (path) => `${DM_PRIVATE_PREFIX}${path}`;

export const decodePrivateDmAttachment = (value) => (
  isPrivateDmAttachment(value)
    ? value.slice(DM_PRIVATE_PREFIX.length)
    : value
);

export const createPrivateDmAttachmentPath = (currentUserId, targetUserId, fileName) => {
  const [firstUserId, secondUserId] = [currentUserId, targetUserId].sort();
  const safeName = sanitizeFileName(fileName);
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  return `${firstUserId}/${secondUserId}/${timestamp}_${randomId}_${safeName}`;
};

export async function createPrivateDmSignedUrl(value) {
  const path = decodePrivateDmAttachment(value);
  if (!path) return null;

  const { data, error } = await supabase
    .storage
    .from(DM_PRIVATE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      download: false,
    });

  if (error) {
    throw error;
  }

  return data?.signedUrl ?? null;
}
