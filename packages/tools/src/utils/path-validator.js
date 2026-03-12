import * as path from 'path';
import * as fs from 'fs/promises';
export async function validatePath(inputPath, workingDir) {
    const normalizedPath = path.normalize(path.resolve(workingDir, inputPath));
    let realPath;
    let realWorkingDir;
    try {
        realPath = await fs.realpath(normalizedPath);
    }
    catch {
        throw new Error('路径不存在或无法访问');
    }
    try {
        realWorkingDir = await fs.realpath(workingDir);
    }
    catch {
        throw new Error('工作目录不存在或无法访问');
    }
    if (!realPath.startsWith(realWorkingDir + path.sep) &&
        realPath !== realWorkingDir) {
        throw new Error('权限不足：无法访问工作目录外的文件');
    }
    return realPath;
}
export async function validatePathForWrite(inputPath, workingDir) {
    const normalizedPath = path.normalize(path.resolve(workingDir, inputPath));
    let realWorkingDir;
    try {
        realWorkingDir = await fs.realpath(workingDir);
    }
    catch {
        throw new Error('工作目录不存在或无法访问');
    }
    const parentDir = path.dirname(normalizedPath);
    try {
        const realParentDir = await fs.realpath(parentDir);
        if (!realParentDir.startsWith(realWorkingDir + path.sep) &&
            realParentDir !== realWorkingDir) {
            throw new Error('权限不足：无法在工作目录外创建文件');
        }
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            if (!normalizedPath.startsWith(realWorkingDir + path.sep)) {
                throw new Error('权限不足：无法在工作目录外创建文件');
            }
        }
        else {
            throw error;
        }
    }
    return normalizedPath;
}
export async function isWithinDirectory(filePath, directory) {
    try {
        const realFilePath = await fs.realpath(filePath);
        const realDirectory = await fs.realpath(directory);
        return realFilePath.startsWith(realDirectory + path.sep);
    }
    catch {
        return false;
    }
}
export function sanitizeFilename(filename) {
    const sanitized = filename
        .replace(/\.\./g, '')
        .replace(/[<>:"|?*\x00-\x1f]/g, '_')
        .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1');
    return sanitized || 'unnamed';
}
