// git-connector.js - Modul für die Integration von Git-Repositories und lokalen Ordnern
const axios       = require('axios');
const path        = require('path');
const fs          = require('fs');
const {promisify} = require('util');
const {exec}      = require('child_process');
const {head}      = require("axios");
const execAsync   = promisify(exec);

// Klasse für die Repository-Verwaltung
class GitConnector {
    constructor(config) {
        this.config  = config;
        this.repos   = {};
        this.folders = {};
        this.tokens  = {};

        // Erstelle Verzeichnis für gecachte Repositories
        this.reposCachePath = path.join(config.dataPath || process.cwd(), 'repos_cache');
        if (!fs.existsSync(this.reposCachePath)) {
            fs.mkdirSync(this.reposCachePath, {recursive: true});
        }

        // Lade gespeicherte Repositories und Ordner
        this.loadSavedData();
    }

    /**
     * Lädt gespeicherte Repositories und Ordner
     */
    loadSavedData() {
        try {
            const dataPath = path.join(this.config.dataPath || process.cwd(), 'shared_sources.json');

            if (fs.existsSync(dataPath)) {
                const data   = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                this.repos   = data.repos || {};
                this.folders = data.folders || {};
                this.tokens  = data.tokens || {};
            }
        } catch (error) {
            console.error('Fehler beim Laden der gespeicherten Repositories und Ordner:', error);
        }
    }

    /**
     * Speichert Repositories und Ordner
     */
    saveData() {
        try {
            const dataPath = path.join(this.config.dataPath || process.cwd(), 'shared_sources.json');

            // Entferne sensitive Informationen aus den zu speichernden Daten
            const safeRepos = {};
            for (const [id, repo] of Object.entries(this.repos)) {
                safeRepos[id] = {
                    ...repo,
                    // Entferne lokalen Pfad aus den gespeicherten Daten
                    localPath: undefined
                };
            }

            const data = {
                repos  : safeRepos,
                folders: this.folders,
                tokens : this.tokens
            };

            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Fehler beim Speichern der Repositories und Ordner:', error);
        }
    }

    /**
     * Fügt ein neues Git-Repository hinzu
     * @param {object} repo - Repository-Informationen
     * @returns {string} - ID des Repositories
     */
    addRepository(repo) {
        const repoId = `repo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.repos[repoId] = {
            id          : repoId,
            name        : repo.name,
            url         : repo.url,
            type        : repo.type, // 'github', 'gitlab', etc.
            branch      : repo.branch || 'main',
            customDomain: repo.customDomain || false,
            baseUrl     : repo.baseUrl, // Für self-hosted Instanzen
            addedAt     : new Date().toISOString(),
            lastSynced  : null,
            isPrivate   : repo.isPrivate || false
        };

        this.saveData();
        return repoId;
    }

    /**
     * Fügt einen lokalen Ordner hinzu
     * @param {object} folder - Ordner-Informationen
     * @returns {string} - ID des Ordners
     */
    addFolder(folder) {
        const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.folders[folderId] = {
            id         : folderId,
            name       : folder.name || path.basename(folder.path),
            path       : folder.path,
            addedAt    : new Date().toISOString(),
            lastIndexed: null
        };

        this.saveData();
        return folderId;
    }

    /**
     * Speichert ein API-Token für einen Git-Service
     * @param {string} service - Dienst ('github', 'gitlab', etc.)
     * @param {string} token - API-Token
     * @param {string} domain - Optionale Domain für self-hosted Instanzen
     */
    saveToken(service, token, domain = null) {
        const tokenId = domain ? `${service}_${domain}` : service;

        this.tokens[tokenId] = {
            service,
            domain,
            token,
            addedAt: new Date().toISOString()
        };

        this.saveData();
        return tokenId;
    }

    /**
     * Lädt ein Repository herunter oder aktualisiert es
     * @param {string} repoId - ID des Repositories
     * @returns {Promise<object>} - Ergebnis des Vorgangs
     */
    async syncRepository(repoId) {
        const repo = this.repos[repoId];
        if (!repo) {
            throw new Error(`Repository mit ID ${repoId} nicht gefunden`);
        }

        // Bestimme den lokalen Pfad für das Repository
        const repoDir  = path.join(this.reposCachePath, repoId);
        repo.localPath = repoDir;

        try {
            // Überprüfe, ob das Repository bereits lokal existiert
            const exists = fs.existsSync(path.join(repoDir, '.git'));

            if (exists) {
                // Repository aktualisieren (git pull)
                await this.gitPull(repoDir, repo);
            } else {
                // Repository klonen
                await this.gitClone(repo, repoDir);
            }

            // Aktualisiere den Zeitstempel der letzten Synchronisierung
            repo.lastSynced = new Date().toISOString();
            this.saveData();

            return {
                success  : true,
                repoId,
                localPath: repoDir
            };
        } catch (error) {
            console.error(`Fehler bei der Synchronisierung des Repositories ${repoId}:`, error);
            return {
                success: false,
                error  : error.message
            };
        }
    }

    /**
     * Klont ein Repository
     * @param {object} repo - Repository-Informationen
     * @param {string} targetDir - Zielverzeichnis
     */
    async gitClone(repo, targetDir) {
        // Erstelle das Zielverzeichnis, falls es nicht existiert
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {recursive: true});
        }

        let cloneUrl = repo.url;

        // Bei privaten Repositories: Authentifizierung hinzufügen wenn möglich
        if (repo.isPrivate) {
            const tokenInfo = this.getTokenForRepo(repo);
            if (tokenInfo) {
                // Beispiel für GitHub: https://{token}@github.com/user/repo.git
                const urlObj = new URL(cloneUrl);
                cloneUrl     = `https://${tokenInfo.token}@${urlObj.host}${urlObj.pathname}`;
            }
        }

        const command = `git clone --depth 1 --branch ${repo.branch} ${cloneUrl} "${targetDir}"`;
        await execAsync(command);
    }

    /**
     * Aktualisiert ein Repository (git pull)
     * @param {string} repoDir - Verzeichnis des Repositories
     * @param {object} repo - Repository-Informationen
     */
    async gitPull(repoDir, repo) {
        // Wechsle in das Repository-Verzeichnis und führe git pull aus
        const command = `cd "${repoDir}" && git pull origin ${repo.branch}`;
        await execAsync(command);
    }

    /**
     * Findet das passende Token für ein Repository
     * @param {object} repo - Repository-Informationen
     * @returns {object|null} - Token-Informationen oder null
     */
    getTokenForRepo(repo) {
        // Für self-hosted Instanzen
        if (repo.customDomain && repo.baseUrl) {
            const domain  = new URL(repo.baseUrl).host;
            const tokenId = `${repo.type}_${domain}`;
            return this.tokens[tokenId] || null;
        }

        // Für Standard-Instanzen
        return this.tokens[repo.type] || null;
    }

    /**
     * Liest die Dateien in einem Ordner oder Repository
     * @param {string} sourceId - ID des Ordners oder Repositories
     * @param {string} subPath - Optionaler Unterpfad
     * @returns {Promise<object>} - Liste der Dateien und Verzeichnisse
     */
    async listFiles(sourceId, subPath = '') {
        try {
            // Bestimme, ob es sich um ein Repository oder einen Ordner handelt
            let basePath   = '';
            let sourceType = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository wurde noch nicht synchronisiert
                    await this.syncRepository(sourceId);
                }
                basePath   = this.repos[sourceId].localPath;
                sourceType = 'repository';
            } else if (sourceId.startsWith('folder_')) {
                basePath   = this.folders[sourceId].path;
                sourceType = 'folder';
            } else {
                throw new Error(`Ungültige Quell-ID: ${sourceId}`);
            }

            // Vollständigen Pfad berechnen
            const fullPath = path.join(basePath, subPath);

            // Prüfen, ob der Pfad existiert
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Pfad existiert nicht: ${fullPath}`);
            }

            // Dateien und Verzeichnisse auflisten
            const entries = fs.readdirSync(fullPath, {withFileTypes: true});

            const files       = [];
            const directories = [];

            for (const entry of entries) {
                // .git-Verzeichnisse und versteckte Dateien überspringen
                if (entry.name === '.git' || entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(subPath, entry.name);

                if (entry.isDirectory()) {
                    directories.push({
                        name: entry.name,
                        path: entryPath,
                        type: 'directory'
                    });
                } else {
                    // Dateigröße ermitteln
                    const stats = fs.statSync(path.join(fullPath, entry.name));

                    files.push({
                        name     : entry.name,
                        path     : entryPath,
                        type     : 'file',
                        size     : stats.size,
                        extension: path.extname(entry.name).toLowerCase()
                    });
                }
            }

            return {
                success    : true,
                sourceId,
                sourceType,
                currentPath: subPath,
                directories,
                files
            };
        } catch (error) {
            console.error(`Fehler beim Auflisten der Dateien für ${sourceId}:`, error);
            return {
                success: false,
                error  : error.message
            };
        }
    }

    /**
     * Liest den Inhalt einer Datei
     * @param {string} sourceId - ID des Ordners oder Repositories
     * @param {string} filePath - Pfad zur Datei
     * @returns {Promise<object>} - Dateiinhalt
     */
    async readFile(sourceId, filePath) {
        try {
            // Bestimme, ob es sich um ein Repository oder einen Ordner handelt
            let basePath = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository wurde noch nicht synchronisiert
                    await this.syncRepository(sourceId);
                }
                basePath = this.repos[sourceId].localPath;
            } else if (sourceId.startsWith('folder_')) {
                basePath = this.folders[sourceId].path;
            } else {
                throw new Error(`Ungültige Quell-ID: ${sourceId}`);
            }

            // Vollständigen Pfad berechnen
            const fullPath = path.join(basePath, filePath);

            // Prüfen, ob die Datei existiert
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Datei existiert nicht: ${fullPath}`);
            }

            // Dateistatistiken abrufen
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                throw new Error(`Der angegebene Pfad ist ein Verzeichnis: ${filePath}`);
            }

            // Dateigröße prüfen (Begrenzung auf 5 MB)
            if (stats.size > 5 * 1024 * 1024) {
                throw new Error(`Datei ist zu groß (> 5 MB): ${filePath}`);
            }

            // Dateiinhalt lesen
            const content   = fs.readFileSync(fullPath, 'utf8');
            const extension = path.extname(fullPath).toLowerCase();

            return {
                success: true,
                sourceId,
                filePath,
                content,
                extension,
                size   : stats.size
            };
        } catch (error) {
            console.error(`Fehler beim Lesen der Datei ${sourceId}/${filePath}:`, error);
            return {
                success: false,
                error  : error.message
            };
        }
    }

    /**
     * Sucht nach Dateien in einem Ordner oder Repository
     * @param {string} sourceId - ID des Ordners oder Repositories
     * @param {string} query - Suchbegriff
     * @param {object} options - Suchoptionen (Dateitypen, max. Ergebnisse, etc.)
     * @returns {Promise<object>} - Suchergebnisse
     */
    async searchFiles(sourceId, query, options = {}) {
        try {
            // Standardoptionen
            const searchOptions = {
                maxResults   : options.maxResults || 20,
                extensions   : options.extensions || null, // z.B. ['.js', '.html']
                includeBinary: options.includeBinary || false,
                recursive    : options.recursive !== false // Standardmäßig rekursiv
            };

            // Bestimme, ob es sich um ein Repository oder einen Ordner handelt
            let basePath = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository wurde noch nicht synchronisiert
                    await this.syncRepository(sourceId);
                }
                basePath = this.repos[sourceId].localPath;
            } else if (sourceId.startsWith('folder_')) {
                basePath = this.folders[sourceId].path;
            } else {
                throw new Error(`Ungültige Quell-ID: ${sourceId}`);
            }

            // Suche mit grep durchführen (Linux/macOS) oder findstr (Windows)
            let command;
            if (process.platform === 'win32') {
                // Windows-Befehl (findstr)
                command = `cd "${basePath}" && findstr /s /i /n "${query}" *`;

                // Dateitypenfilter hinzufügen, falls angegeben
                if (searchOptions.extensions && searchOptions.extensions.length > 0) {
                    command = `cd "${basePath}" && findstr /s /i /n "${query}" `;
                    searchOptions.extensions.forEach(ext => {
                        command += `*${ext} `;
                    });
                }
            } else {
                // Unix-Befehl (grep)
                command = `cd "${basePath}" && grep -r -i -n "${query}" --include="*" .`;

                // Dateitypenfilter hinzufügen, falls angegeben
                if (searchOptions.extensions && searchOptions.extensions.length > 0) {
                    command = `cd "${basePath}" && grep -r -i -n "${query}" `;
                    searchOptions.extensions.forEach(ext => {
                        command += `--include="*${ext}" `;
                    });
                    command += '.';
                }
            }

            // Befehl ausführen
            const {stdout} = await execAsync(command);

            // Ergebnisse parsen
            const results = [];
            const lines   = stdout.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                // Ergebnis parsen (Format ist abhängig vom Betriebssystem)
                let filePath, lineNumber, matchContent;

                if (process.platform === 'win32') {
                    // Windows (findstr): Dateiname:Zeilennummer:Inhalt
                    const match = line.match(/^([^:]+):(\d+):(.*)/);
                    if (match) {
                        [, filePath, lineNumber, matchContent] = match;
                    }
                } else {
                    // Unix (grep): ./Dateipfad:Zeilennummer:Inhalt
                    const match = line.match(/^\.\/([^:]+):(\d+):(.*)/);
                    if (match) {
                        [, filePath, lineNumber, matchContent] = match;
                    }
                }

                if (filePath) {
                    // Binärdateien ausschließen, wenn nicht explizit eingeschlossen
                    const ext      = path.extname(filePath).toLowerCase();
                    const isBinary = ['.exe', '.dll', '.so', '.bin', '.dat', '.zip', '.rar', '.7z', '.gz'].includes(ext);

                    if (!isBinary || searchOptions.includeBinary) {
                        results.push({
                            path      : filePath,
                            lineNumber: parseInt(lineNumber, 10),
                            content   : matchContent.trim(),
                            extension : ext
                        });
                    }

                    // Maximale Anzahl von Ergebnissen begrenzen
                    if (results.length >= searchOptions.maxResults) {
                        break;
                    }
                }
            }

            return {
                success: true,
                sourceId,
                query,
                results
            };
        } catch (error) {
            console.error(`Fehler bei der Dateisuche in ${sourceId}:`, error);
            return {
                success: false,
                error  : error.message
            };
        }
    }

    /**
     * Entfernt ein Repository oder einen Ordner
     * @param {string} sourceId - ID des Ordners oder Repositories
     * @returns {Promise<object>} - Ergebnis des Vorgangs
     */
    async removeSource(sourceId) {
        try {
            if (sourceId.startsWith('repo_')) {
                // Repository entfernen
                const repo = this.repos[sourceId];
                if (repo) {
                    // Lokales Verzeichnis löschen, falls vorhanden
                    if (repo.localPath && fs.existsSync(repo.localPath)) {
                        await this.deleteFolderRecursive(repo.localPath);
                    }

                    // Aus der Liste entfernen
                    delete this.repos[sourceId];
                }
            } else if (sourceId.startsWith('folder_')) {
                // Ordner aus der Liste entfernen (nicht physisch löschen)
                delete this.folders[sourceId];
            } else {
                throw new Error(`Ungültige Quell-ID: ${sourceId}`);
            }

            this.saveData();

            return {
                success: true,
                sourceId
            };
        } catch (error) {
            console.error(`Fehler beim Entfernen der Quelle ${sourceId}:`, error);
            return {
                success: false,
                error  : error.message
            };
        }
    }

    /**
     * Löscht ein Verzeichnis rekursiv
     * @param {string} folderPath - Pfad zum Verzeichnis
     */
    async deleteFolderRecursive(folderPath) {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach((file) => {
                const curPath = path.join(folderPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    // Rekursiver Aufruf für Unterverzeichnisse
                    this.deleteFolderRecursive(curPath);
                } else {
                    // Datei löschen
                    fs.unlinkSync(curPath);
                }
            });

            // Verzeichnis löschen
            fs.rmdirSync(folderPath);
        }
    }

    /**
     * Gibt alle Repositories zurück
     * @returns {object} - Liste aller Repositories
     */
    getAllRepositories() {
        return this.repos;
    }

    /**
     * Gibt alle Ordner zurück
     * @returns {object} - Liste aller Ordner
     */
    getAllFolders() {
        return this.folders;
    }

    /**
     * Prüft eine Repository-URL und extrahiert Informationen
     * @param {string} url - Repository-URL
     * @returns {Promise<object>} - Repository-Informationen
     */
    async checkRepositoryUrl(url) {
        try {
            // Basis-URL und Typ ermitteln
            let type         = '';
            let baseUrl      = '';
            let repoPath     = '';
            let customDomain = false;

            // URL-Verarbeitung
            const urlObj   = new URL(url);
            const hostname = urlObj.hostname;

            // Repository-Pfad extrahieren (ohne .git-Endung)
            const pathname = urlObj.pathname.endsWith('.git')
                ? urlObj.pathname.slice(0, -4)
                : urlObj.pathname;

            // Service-Typ ermitteln
            if (hostname === 'github.com') {
                type     = 'github';
                baseUrl  = 'https://github.com';
                repoPath = pathname;
            } else if (hostname === 'gitlab.com') {
                type     = 'gitlab';
                baseUrl  = 'https://gitlab.com';
                repoPath = pathname;
            } else if (hostname.includes('github')) {
                // Self-hosted GitHub Enterprise
                type         = 'github';
                baseUrl      = `https://${hostname}`;
                repoPath     = pathname;
                customDomain = true;
            } else if (hostname.includes('gitlab')) {
                // Self-hosted GitLab
                type         = 'gitlab';
                baseUrl      = `https://${hostname}`;
                repoPath     = pathname;
                customDomain = true;
            } else {
                // Generischer Git-Service
                type         = 'git';
                baseUrl      = `https://${hostname}`;
                repoPath     = pathname;
                customDomain = true;
            }

            // Repository-Namen aus dem Pfad extrahieren
            let name  = '';
            let owner = '';

            // Format: /owner/repo
            const pathParts = repoPath.split('/').filter(part => part.length > 0);
            if (pathParts.length >= 2) {
                owner = pathParts[0];
                name  = pathParts[1];
            } else {
                throw new Error('Ungültiges Repository-Format in der URL');
            }

            // API-Anfrage, um zu prüfen, ob das Repository existiert und ob es privat ist
            let isPrivate = false;

            // Nur für bekannte Dienste API-Prüfung durchführen
            if (type === 'github' && !customDomain) {
                try {
                    const repoInfoUrl = `https://api.github.com/repos/${owner}/${name}`;

                    console.log(repoInfoUrl);
                    const headers = {
                        'X-GitHub-Api-Version': '2022-11-28'
                    };

                    if (this.tokens.includes('github') === true) {
                        headers.Authorization = `Bearer ${this.tokens.github.token}`;
                    }


                    const response = await axios.get(repoInfoUrl, {
                        headers: headers
                    });

                    if (response.data) {
                        isPrivate = response.data.private === true;
                    }
                } catch (apiError) {
                    if (apiError.response && apiError.response.status === 404) {
                        throw new Error('Repository nicht gefunden');
                    }
                    // Bei anderen Fehlern: Annahme, dass es sich um ein privates Repository handelt
                    isPrivate = true;
                }
            } else if (type === 'gitlab' && !customDomain) {
                try {
                    const repoInfoUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${name}`)}`;
                    const response    = await axios.get(repoInfoUrl);

                    if (response.data) {
                        isPrivate = response.data.visibility === 'private';
                    }
                } catch (apiError) {
                    if (apiError.response && apiError.response.status === 404) {
                        throw new Error('Repository nicht gefunden');
                    }
                    // Bei anderen Fehlern: Annahme, dass es sich um ein privates Repository handelt
                    isPrivate = true;
                }
            } else {
                // Für selbst-gehostete oder unbekannte Dienste: Annahme, dass ein Token erforderlich ist
                isPrivate = true;
            }

            return {
                success: true,
                url,
                type,
                name,
                owner,
                repoPath,
                baseUrl,
                customDomain,
                isPrivate
            };
        } catch (error) {
            console.error('Fehler bei der Repository-URL-Überprüfung:', error);
            return {
                success: false,
                error  : error.message
            };
        }
    }
}

module.exports = GitConnector;