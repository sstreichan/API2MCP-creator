Du bist ein Principal Go Engineer, CLI-Architekt und MCP-Spezialist. Erstelle einen belastbaren, implementierungsreifen Umbauplan für das Repository:

https://github.com/sstreichan/API2MCP-creator

WICHTIG: Schreibe keinen Anwendungscode, keinen Pseudocode und keine vollständigen Code-Snippets. Liefere ausschließlich eine technische Analyse, Architekturentscheidungen, einen umsetzbaren Migrationsplan, Testdesign, Risiken und objektiv prüfbare Akzeptanzkriterien.

# Verbindlicher Prüfstand

Nutze zunächst diesen überprüften Repository-Commit als Ausgangspunkt:

2ea466aa2528c16c7525d71861f155ee728b8e36

Falls der Default-Branch inzwischen einen anderen Stand hat:
1. Ermittle den aktuellen Commit.
2. Dokumentiere die Abweichung zum obigen Prüfstand.
3. Führe den Repository-Audit gegen den aktuellen Stand vollständig erneut aus.
4. Verweise im Ergebnis auf den tatsächlich geprüften Commit oder Branch.

# Ziel

Das bisherige TypeScript-/Node.js-Projekt soll durch ein eigenständiges, idiomatisches Go-Repository ersetzt werden.

Das Zielprodukt ist:
- Eine lokal ausführbare Go-CLI
- Ein MCP-Server für die Interaktion mit REST-/HTTP-APIs
- Eine klare, sichere und testbare Konfiguration
- Ein wartbares Go-Projekt mit expliziten Grenzen zwischen CLI, MCP, Domänenlogik, Konfiguration, HTTP und Observability

Breaking Changes sind ausdrücklich erlaubt und erwünscht.

Dies ist keine mechanische 1:1-Portierung. Analysiere den TypeScript-Bestand kritisch. Übernimm nur fachlich sinnvolles Verhalten. Vereinfache, entferne oder gestalte Funktionen neu, wenn sie Node-spezifisch, unsicher, unklar, redundant, schwer testbar oder architektonisch schwach sind.

# Nicht im Scope

Plane ausdrücklich nicht:
- Containerisierung oder Dockerfiles
- Kubernetes, Helm oder Infrastruktur-as-Code
- CI/CD-Workflows
- Cross-Compilation- oder Release-Pipelines
- GitHub-Release-Automatisierung
- Deployment auf Servern oder Cloud-Plattformen
- Frontend, Web-UI oder API-Gateway
- Eine Kompatibilitätsschicht für die alte TypeScript-CLI
- Den parallelen Betrieb beider Implementierungen im Produktivmodus
- Anwendungscode oder Implementierungsdetails auf Codeebene

# Repository-Audit

Untersuche das Repository vollständig, bevor du Architekturentscheidungen empfiehlst.

Berücksichtige mindestens:
- README.md
- package.json und package-lock.json
- tsconfig.json
- alle Dateien unter src/
- alle Dateien unter test/
- alle Dateien unter examples/
- alle Dateien unter scripts/
- GitHub-Konfiguration unter .github/
- relevante Branches, offene Issues, Pull Requests und Releases, falls vorhanden

Erfasse für jede relevante Datei oder jedes Modul:
- Zweck und Verantwortung
- Aufrufer und Abhängigkeiten
- Eingaben, Ausgaben und Seiteneffekte
- Konfiguration und Umgebungsvariablen
- Fehler- und Retry-Verhalten
- Sicherheitsrelevante Aspekte
- Testabdeckung und erkennbare Lücken

Identifiziere insbesondere:
- MCP-Tool-Namen, Beschreibungen, Eingabeschemas und Rückgabeformate
- verwendete MCP-Transports und Server-Lifecycle-Verhalten
- HTTP-Request-Aufbau, Query-Parameter-Serialisierung, Header und Body-Verarbeitung
- Authentifizierungsmechanismen und Secret-Handling
- Logging-Verhalten und mögliche Kollisionen zwischen Logs und MCP-Protokollausgaben
- Retry-, Timeout-, Backoff- und Cancellation-Verhalten
- implizite Defaults, globale Zustände und schwer nachvollziehbare Annahmen
- technische Schulden und sicherheitsrelevante Risiken

# Architekturprinzipien

Entwirf anschließend eine Go-Zielarchitektur mit diesen verbindlichen Prinzipien:

- Idiomatisches Go statt Übernahme von Node-/TypeScript-Mustern.
- Möglichst kleine, klar verantwortliche Packages.
- Strikte Trennung zwischen CLI, Konfiguration, MCP-Adapter, Tool-Definitionen, HTTP-Client, Domänenlogik und Logging.
- Keine übermäßige Abstraktion, keine generischen Framework-Schichten ohne konkreten Nutzen.
- Konsequente Nutzung von context.Context für Lifecycle, Abbruch und HTTP-Aufrufe.
- Deterministische und vollständig validierte Konfiguration.
- Sichere Behandlung von API-Schlüsseln, Authorization-Headern und sensitiven Request-/Response-Daten.
- Strukturierte, konfigurierbare Logs auf stderr oder einem klar getrennten Sink; niemals Vermischung mit stdio-MCP-Protokolldaten.
- Reproduzierbare Fehlerklassifizierung und stabile, dokumentierte Exit-Codes.
- Testbarkeit ohne externe Live-APIs als Voraussetzung.

# Architekturentscheidungen

Triff und begründe alle folgenden Entscheidungen erst nach dem Audit:

1. Go-Modulname und Repository-Identität
2. Geeignetes Go-Projektlayout, beispielsweise cmd/ und internal/
3. CLI-Kommandostruktur, Flags, Konfigurationsquellen und Prioritätsregeln
4. MCP-SDK- bzw. Bibliotheksentscheidung
5. MCP-Transportentscheidung
6. Unterstützung oder bewusster Ausschluss alternativer MCP-Transports
7. Öffentliche Tool-Schnittstelle einschließlich Namen, Eingaben, Ausgaben und Fehlerformat
8. HTTP-Client-Architektur einschließlich Timeouts, Retry-Regeln, Backoff, Redirects und Context-Cancellation
9. Konfigurations- und Secret-Strategie
10. Logging-, Debugging- und Observability-Strategie
11. Teststrategie und Test-Doubles
12. Strategie für das geordnete Entfernen des TypeScript-/Node.js-Altbestands

Für die MCP-SDK- und Transportentscheidung:
- Prüfe die zum Planungszeitpunkt aktiven und geeigneten Go-Optionen.
- Bewerte mindestens Wartungsstatus, Protokollabdeckung, Transportunterstützung, API-Stabilität, Testbarkeit, Lizenz und Integrationsaufwand.
- Verwende eine Entscheidungsmatrix.
- Falls die Evidenz für eine Bibliothek unzureichend ist, markiere dies klar als Verifikationspunkt statt eine unbelegte Empfehlung auszusprechen.
- Empfiehl genau eine Standardoption mit einer nachvollziehbaren Begründung.
- Dokumentiere verworfene Alternativen und ihren Ausschlussgrund.

# Breaking-Change-Strategie

Erstelle eine vollständige Funktions- und Schnittstellenmatrix.

Für jedes relevante Verhalten des TypeScript-Projekts muss die Matrix ausweisen:
- Bestehende Datei oder Komponente
- Bisherige Verantwortung und öffentliches Verhalten
- Zielkomponente oder Zielpackage in Go
- Entscheidung: übernehmen, neu gestalten oder entfernen
- Exakte Art des Breaking Changes
- Fachliche und technische Begründung
- Migrationsauswirkung für bisherige Nutzer
- Test- oder Akzeptanzkriterium

Behandle mindestens:
- bisherige Tool-Namen
- Tool-Parameter und Schema-Validierung
- Antwortformate
- Fehlerformate
- CLI-Startverhalten
- Konfigurationsnamen und Umgebungsvariablen
- Retry- und Timeout-Semantik
- Logging-Ausgaben
- Beispiele und Dokumentation
- Node-/npm-/TypeScript-spezifische Dateien und Abhängigkeiten

# Phasenplan

Erstelle einen sequenziellen Plan mit den folgenden Phasen:

1. Baseline-Audit und Zielvertragsdefinition
2. Initialisierung des Go-Moduls und Ziel-Projektlayouts
3. Konfigurationsmodell, CLI und Prozess-Lifecycle
4. MCP-Server, SDK-Integration und gewählter Transport
5. Öffentliche MCP-Tools und Eingabe-/Ausgabemodell
6. HTTP-Integration, Authentifizierung und Response-Normalisierung
7. Fehlerbehandlung, Retry, Timeouts, Cancellation und Logging
8. Testdesign, Testumgebung und Qualitäts-Gates
9. README, CLI-Referenz, Beispiele und Breaking-Change-Migrationsnotiz
10. Verifikation der Definition of Done und Entsorgung des TypeScript-Altbestands

Für jede Phase liefere:
- Ziel
- Voraussetzungen und Abhängigkeiten
- Konkrete anzulegende, umzubenennende, zu ersetzende oder zu löschende Verzeichnisse und Dateien
- Fachliche und technische Aufgaben
- Entscheidungen, die vor Abschluss der Phase getroffen sein müssen
- Hauptrisiken und konkrete Gegenmaßnahmen
- Objektiv prüfbare Akzeptanzkriterien
- Ergebnisartefakte, jedoch ohne deren Code auszuformulieren

Plane die Löschung von package.json, package-lock.json, tsconfig.json, src/, test/, Node-Skripten und sonstigen TypeScript-Artefakten erst in Phase 10 ein. Voraussetzung dafür ist, dass die Go-Alternative alle vereinbarten Qualitäts- und Abnahmekriterien erfüllt.

# Test- und Qualitätsdesign

Definiere ein konkretes Testdesign ohne Tests zu implementieren.

Berücksichtige:
- Unit-Tests für Konfigurationsvalidierung, Defaulting und Prioritätsregeln
- Unit-Tests für Query-Parameter, Header, Request-Bodies und Response-Normalisierung
- Unit-Tests für Fehlerklassifizierung und Retry-Entscheidungen
- HTTP-Integrationstests über einen lokalen, kontrollierten Testserver
- MCP-Transport- und Protokolltests passend zum gewählten Transport
- CLI-Tests für Help-Ausgabe, ungültige Flags, fehlende Pflichtkonfiguration und Exit-Codes
- Negative Tests für ungültige URLs, ungültige API-Antworten, Timeouts, Context-Abbruch, 4xx-/5xx-Antworten und nicht-retrybare Fehler
- Sicherheitstests, die ausschließen, dass Secrets, Authorization-Werte oder vertrauliche HTTP-Daten in Logs, Fehlern oder Test-Fixtures erscheinen
- Regressionstests für fachlich übernommenes Kernverhalten aus dem TypeScript-Bestand

Definiere konkrete Qualitäts-Gates:
- Formatierung
- go vet
- begründete statische Analyse
- relevante Race-Detection
- stabile Dokumentation der CLI und Exit-Codes
- keine Live-API-Abhängigkeit für die Testausführung
- keine sensitiven Werte in Repository, Logs oder Fehlerausgaben

# Erforderliches Ausgabeformat

Strukturiere die Antwort exakt in dieser Reihenfolge:

1. Executive Summary
2. Audit-Baseline und geprüfter Repository-Stand
3. Ist-Analyse des TypeScript-Projekts
4. Technische Schulden, Sicherheitsbefunde und Funktionslücken
5. Zielbild und begründete Architekturentscheidungen
6. Entscheidungsmatrix für Go-MCP-SDK und MCP-Transport
7. Ziel-Projektlayout als Verzeichnisbaum ohne Code
8. Tabelle: TypeScript-Altbestand → Go-Zielverantwortlichkeit → Breaking Change
9. Detaillierter Phasenplan mit Akzeptanzkriterien
10. Test- und Qualitätsdesign
11. Risikoregister mit Priorität, Wahrscheinlichkeit, Auswirkung, Frühindikator und Gegenmaßnahme
12. Annahmen und ausschließlich echte verbleibende Blocker
13. Definition of Done

# Qualitätsanforderungen an die Planung

- Jede wesentliche Empfehlung muss entweder durch einen konkreten Repository-Befund oder als klar gekennzeichnete Annahme begründet sein.
- Verwende keine unbelegten Aussagen über Abhängigkeiten, SDKs oder die aktuelle Implementierung.
- Benenne ausdrücklich, was bewusst nicht migriert wird.
- Beschreibe keine bloßen Best Practices; formuliere überprüfbare technische Konsequenzen.
- Der Plan muss ohne zusätzliche Interpretation direkt in GitHub-Milestones, Epics und Issues zerlegbar sein.
- Schreibe auf Deutsch; technische Begriffe, Paketnamen und CLI-Beispiele dürfen Englisch bleiben.