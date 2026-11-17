import { getAccessToken } from './googleAuth';

interface SendEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  attachmentBlob?: Blob;
  attachmentFileName?: string;
}

/**
 * Encodes a string securely to UTF-8 base64 for email headers
 */
const encodeUtf8Base64 = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

/**
 * Composes a MIME format email (RFC 2822/MIME) and sends it using the Google Gmail REST API.
 */
export const sendGmailMessage = async (params: SendEmailParams): Promise<void> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No Google Access Token disponible. Inicia sesión con tu cuenta de Google.');
  }

  const { to, subject, bodyHtml, attachmentBlob, attachmentFileName } = params;
  const boundary = "------=_NextPart_MedConcilia_" + Math.random().toString(36).substring(4).toUpperCase();
  
  // Create headers
  let mimeString = `To: ${to}\r\n`;
  mimeString += `Subject: =?utf-8?B?${encodeUtf8Base64(subject)}?=\r\n`;
  mimeString += `MIME-Version: 1.0\r\n`;
  
  if (attachmentBlob && attachmentFileName) {
    mimeString += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Body Text/HTML Part
    mimeString += `--${boundary}\r\n`;
    mimeString += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mimeString += `Content-Transfer-Encoding: base64\r\n\r\n`;
    mimeString += encodeUtf8Base64(bodyHtml) + `\r\n\r\n`;
    
    // Attachment Part
    mimeString += `--${boundary}\r\n`;
    const mimeType = attachmentBlob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    mimeString += `Content-Type: ${mimeType}; name="${attachmentFileName}"\r\n`;
    mimeString += `Content-Disposition: attachment; filename="${attachmentFileName}"\r\n`;
    mimeString += `Content-Transfer-Encoding: base64\r\n\r\n`;
    
    // Read blob as base64 string
    const base64Attachment = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = reader.result as string;
        // extract base64 from dataURL
        const base64Data = resultStr.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(attachmentBlob);
    });

    mimeString += base64Attachment + `\r\n\r\n`;
    mimeString += `--${boundary}--`;
  } else {
    // Plain HTML single part message
    mimeString += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mimeString += `Content-Transfer-Encoding: base64\r\n\r\n`;
    mimeString += encodeUtf8Base64(bodyHtml);
  }

  // base64url encode the entire MIME message for the Gmail API
  const base64Safe = btoa(encodeUtf8Base64(mimeString))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: base64Safe
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de la API de Gmail al enviar: ${errorText}`);
  }
};
