export const CHAT_UPLOAD_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "bmp"];

export const CHAT_UPLOAD_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/bmp",
];

export const CHAT_UPLOAD_IMAGE_ACCEPT =
  ".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp";

export const CHAT_UPLOAD_IMAGE_TOOLTIP = "Attach image (png, jpg, jpeg, bmp)";

export const CHAT_UPLOAD_ATTACHMENT_EXTENSIONS = [
  "csv",
  "docx",
  "xlsx",
  "xls",
  "json",
  "pdf",
  "txt",
  "md",
  "mdx",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "tsx",
  "py",
  "sh",
  "sql",
  "js",
  "ts",
  "jpg",
  "jpeg",
  "png",
  "bmp",
  "gltf",
  "glb",
  "obj",
  "stl",
];

export const CHAT_UPLOAD_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/mdx",
  "application/mdx",
  "application/json",
  "application/x-yaml",
  "application/yaml",
  "text/yaml",
  "application/xml",
  "text/xml",
  "text/html",
  "text/javascript",
  "application/javascript",
  "text/typescript",
  "text/x-typescript",
  "text/x-tsx",
  "application/sql",
  "text/x-sql",
  "application/x-sh",
  "text/x-python",
  "image/png",
  "image/jpeg",
  "image/bmp",
  "model/gltf+json",
  "model/gltf-binary",
  "model/obj",
  "model/stl",
  "application/octet-stream",
];

export const CHAT_UPLOAD_ATTACHMENT_ACCEPT =
  ".csv,.json,.pdf,.txt,.md,.mdx,.yaml,.yml,.xml,.html,.htm,.docx,.xlsx,.xls,.py,.sh,.sql,.js,.ts,.tsx,.jpg,.jpeg,.png,.bmp,.gltf,.glb,.obj,.stl,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/markdown,application/json,application/x-yaml,application/yaml,text/yaml,application/xml,text/xml,text/html,text/javascript,application/javascript,text/typescript,text/x-typescript,text/x-tsx,application/sql,text/x-sql,application/x-sh,text/x-python,image/png,image/jpeg,image/bmp,model/gltf+json,model/gltf-binary,model/obj,model/stl";

export const CHAT_UPLOAD_ATTACHMENT_TOOLTIP =
  "Attach file (images, pdf, csv, docx, xlsx, txt, md, json, yaml, xml, html, code files, 3D meshes)";

export const FS_ERROR_TEXT =
  "Unsupported attachment type. Supported chat attachments include images, PDF, CSV, DOCX, XLSX, common text/code files, and glTF/GLB/OBJ/STL 3D meshes.";

export const SN_ERROR_TEXT = CHAT_UPLOAD_ATTACHMENT_EXTENSIONS.join(", ");
