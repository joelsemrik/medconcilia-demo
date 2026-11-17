import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Avoid multiple app initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive Scopes
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/gmail.send');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    cachedUser = user;
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Clear if we were signed in but token is gone
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign in popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return cachedUser || auth.currentUser;
};

export const googleLogout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  cachedUser = null;
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

// List spreadsheets and Excel files from Google Drive
export const listDriveSpreadsheets = async (): Promise<DriveFile[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No Google Drive Access Token available. Call googleSignIn first.');

  // Mime types for spreadsheets (Google Sheets + MS Excel)
  const q = encodeURIComponent(
    "(mimeType = 'application/vnd.google-apps.spreadsheet' or " +
    "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or " +
    "mimeType = 'application/vnd.ms-excel' or " +
    "name contains '.xlsx' or name contains '.xls' or name contains '.csv') and trashed = false"
  );

  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive API error during file listing: ${errText}`);
  }

  const data = await response.json();
  return data.files || [];
};

// Downloads file content from Drive as ArrayBuffer
export const downloadDriveFile = async (fileId: string, mimeType: string): Promise<ArrayBuffer> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  // If it's a native Google Sheet, we MUST export it to an Excel (.xlsx) format using export endpoint
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive API error during file download: ${errText}`);
  }

  return response.arrayBuffer();
};

// Upload a Blob (Excel, PDF, or similar) to Google Drive
export const uploadFileToDrive = async (
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<string> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  // Let's create a metadata boundary and body
  const metadata = {
    name: fileName,
    mimeType: mimeType,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', blob);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive API error during file upload: ${errText}`);
  }

  const result = await response.json();
  return result.id;
};
