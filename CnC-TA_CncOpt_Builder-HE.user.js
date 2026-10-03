// ==UserScript==
// @name         CnC-TA_CncOpt_Builder-HE
// @namespace    Harzi
// @version      0.3.10
// @description  Vergleicht eine Basis mit einem CnCTAOpt-Link, verschiebt vorhandene Gebäude und prüft anschließend die tatsächliche Aufstellung.
// @author       Harzi
// @match        https://*.alliances.commandandconquer.com/*/index.aspx*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    /*
     * CnC-TA CncOpt Builder - HE
     *
     * V0.3.4 = ANALYSE + AUFSTELLUNG
     *
     * Nur vorhandene Gebäude werden verschoben.
     * Kein Abriss, kein Neubau, kein Upgrade.
     *
     * Der CnCTAOpt-Link wird anhand des öffentlichen CnCTAOpt-Encoders
     * ausgewertet:
     *   optionaler Level + ein Zeichen pro Rasterfeld.
     *
     * Die Gebäude werden anschließend über GAMEDATA.Tech[...].n
     * mit den CnCTAOpt-Buchstaben verglichen.
     */

    var PANEL = null;
    var TEXTAREA = null;
    var STATUS = null;
    var ANALYZE_BUTTON = null;
    var APPLY_BUTTON = null;
    var UNDO_BUTTON = null;
    var PROGRESS_BAR = null;
    var PROGRESS_LABEL = null;
    var LAST_ANALYSIS = null;
    var APPLYING = false;

    // Sichtbarkeit des CncOpt-Buttons wie im funktionierenden Building & Off-Saver
    var CNCOPT_BUTTON = null;
    var BUILDING_MODE_TIMER = null;

    var BASE_UNIT_MAP = {
        "GDI_Construction Yard": "y",
        "GDI_Power Plant": "p",
        "GDI_Refinery": "r",
        "GDI_Silo": "s",
        "GDI_Accumulator": "a",
        "GDI_Command Center": "e",
        "GDI_Barracks": "b",
        "GDI_Factory": "f",
        "GDI_Airport": "d",
        "GDI_Defense HQ": "q",
        "GDI_Defense Facility": "w",
        "GDI_Support_Air": "i",
        "GDI_Support_Ion": "x",
        "GDI_Support_Art": "z",
        "GDI_Harvester": "h",
        "GDI_Harvester_Crystal": "n",
        "GDI_Harvester_Tiberium": "j",

        "NOD_Construction Yard": "y",
        "NOD_Power Plant": "p",
        "NOD_Refinery": "r",
        "NOD_Silo": "s",
        "NOD_Accumulator": "a",
        "NOD_Command Post": "e",
        "NOD_Barracks": "b",
        "NOD_Factory": "f",
        "NOD_Airport": "d",
        "NOD_Defense HQ": "q",
        "NOD_Defense Facility": "w",
        "NOD_Support_Air": "i",
        "NOD_Support_Ion": "x",
        "NOD_Support_Art": "z",
        "NOD_Harvester": "h",
        "NOD_Harvester_Crystal": "n",
        "NOD_Harvester_Tiberium": "j",

        "FOR_Construction Yard": "y",
        "FOR_Refinery": "r",
        "FOR_Trade Center": "u",
        "FOR_Silo": "s",
        "FOR_Defense HQ": "q",
        "FOR_Defense Facility": "w",
        "FOR_Harvester_Crystal": "n",
        "FOR_Harvester_Tiberium": "j",
        "FOR_Crystal Booster": "v",
        "FOR_Tiberium Booster": "o",

        "FOR_EVENT_Construction_Yard": "y",
        "FOR_GDI_Construction Yard": "y",
        "FOR_GDI_Power Plant": "p",
        "FOR_GDI_Refinery": "r",
        "FOR_GDI_Silo": "s",
        "FOR_GDI_Accumulator": "a",
        "FOR_GDI_Command Center": "e",
        "FOR_GDI_Barracks": "b",
        "FOR_GDI_Factory": "f",
        "FOR_GDI_Airport": "d",
        "FOR_GDI_Defense HQ": "q",
        "FOR_GDI_Defense Facility": "w",
        "FOR_GDI_Support_Air": "i",
        "FOR_GDI_Support_Ion": "x",
        "FOR_GDI_Support_Art": "z",
        "FOR_GDI_Harvester": "h",
        "FOR_GDI_Harvester_Crystal": "n",
        "FOR_GDI_Harvester_Tiberium": "j",

        "FOR_NOD_Construction Yard": "y",
        "FOR_NOD_Power Plant": "p",
        "FOR_NOD_Refinery": "r",
        "FOR_NOD_Silo": "s",
        "FOR_NOD_Accumulator": "a",
        "FOR_NOD_Command Post": "e",
        "FOR_NOD_Barracks": "b",
        "FOR_NOD_Factory": "f",
        "FOR_NOD_Airport": "d",
        "FOR_NOD_Defense HQ": "q",
        "FOR_NOD_Defense Facility": "w",
        "FOR_NOD_Support_Air": "i",
        "FOR_NOD_Support_Ion": "x",
        "FOR_NOD_Support_Art": "z",
        "FOR_NOD_Harvester": "h",
        "FOR_NOD_Harvester_Crystal": "n",
        "FOR_NOD_Harvester_Tiberium": "j"
    };

    var CODE_TO_NAMES = {};

    Object.keys(BASE_UNIT_MAP).forEach(function (name) {
        var code = BASE_UNIT_MAP[name];

        if (!CODE_TO_NAMES[code]) {
            CODE_TO_NAMES[code] = [];
        }

        CODE_TO_NAMES[code].push(name);
    });

    function log(message, style) {
        console.log(
            "%cCNCOPT-HE: " + message,
            style || "color: cyan; font-weight: bold;"
        );
    }

    function getCurrentCity() {
        try {
            return ClientLib.Data.MainData
                .GetInstance()
                .get_Cities()
                .get_CurrentOwnCity();
        } catch (e) {
            return null;
        }
    }

    function getCurrentBuildings() {
        var city = getCurrentCity();

        if (!city) {
            return [];
        }

        var buildings = city.get_Buildings();
        var result = [];

        for (var id in buildings.d) {
            var building = buildings.d[id];

            if (!building) {
                continue;
            }

            var techId = null;
            var techName = null;

            try {
                techId = building.get_MdbBuildingId();
                techName =
                    GAMEDATA &&
                    GAMEDATA.Tech &&
                    GAMEDATA.Tech[techId]
                        ? GAMEDATA.Tech[techId].n
                        : null;
            } catch (e) {}

            var code = techName && BASE_UNIT_MAP[techName]
                ? BASE_UNIT_MAP[techName]
                : null;

            /*
             * CnCTAOpt encodes real harvesters by the resource underneath:
             *   n = Crystal harvester
             *   j = Tiberium harvester
             *
             * The generic *_Harvester tech name therefore has to be
             * converted using the current resource field.
             */
            if (techName && /_Harvester$/.test(techName)) {
                try {
                    var resourceType = city.GetResourceType(
                        building.get_CoordX(),
                        building.get_CoordY()
                    );

                    if (resourceType === 1) {
                        code = "n";
                    } else if (resourceType === 2) {
                        code = "j";
                    }
                } catch (e) {}
            }

            result.push({
                id: building.get_Id(),
                name: building.get_UnitGameData_Obj().dn,
                techId: techId,
                techName: techName,
                code: code,
                level: building.get_CurrentLevel(),
                x: building.get_CoordX(),
                y: building.get_CoordY(),
                object: building
            });
        }

        return result;
    }

    /*
     * Liest den Teil:
     *
     *   https://www.cnctaopt.com/index.html?ver=3~G~G~Name~CODE~E=new~X=...
     *
     * Der CODE besteht aus 180 Rasterfeldern.
     *
     * Wichtig:
     * CnCTAOpt serialisiert in der Reihenfolge:
     *   i = 0..19
     *   j = 0..8
     *
     * und greift auf game layout / units als [j][i] zu.
     *
     * Für Gebäude und Harvester bedeutet das:
     *   gameX = j
     *   gameY = i
     *
     * Diese Zuordnung wird in V0.1.4 nur analysiert und noch nicht
     * zum Verschieben verwendet.
     */
    function parseCncOptLink(input) {
        var value = String(input || "").trim();

        if (!value) {
            throw new Error("Kein CnCTAOpt-Link eingegeben.");
        }

        if (value.indexOf("http") !== 0) {
            value = "https://www.cnctaopt.com/index.html?" + value;
        }

        var question = value.indexOf("?");

        if (question < 0) {
            throw new Error("Kein '?' im CnCTAOpt-Link gefunden.");
        }

        var query = value.substring(question + 1);

        /*
         * decodeURI reicht hier aus. Die eigentlichen Trennzeichen
         * ~ und = bleiben erhalten.
         */
        try {
            query = decodeURI(query);
        } catch (e) {}

        var parts = query.split("~");

        if (!parts.length || parts[0] !== "ver=3") {
            throw new Error("Kein ver=3 CnCTAOpt-Link erkannt.");
        }

        if (parts.length < 5) {
            throw new Error("Der CnCTAOpt-Link ist unvollständig.");
        }

        var factionBase = parts[1] || "";
        var factionOff = parts[2] || "";
        var cityName = parts[3] || "";
        var code = parts[4] || "";

        var meta = {};

        for (var i = 5; i < parts.length; i++) {
            var p = parts[i];
            var eq = p.indexOf("=");

            if (eq > 0) {
                meta[p.substring(0, eq)] = p.substring(eq + 1);
            }
        }

        var cells = [];
        var pos = 0;

        /*
         * Ein Feld besteht aus:
         *   [0-2 Ziffern] + [genau 1 Zeichen]
         *
         * Level ist optional.
         */
        while (pos < code.length) {
            var start = pos;

            while (
                pos < code.length &&
                code.charAt(pos) >= "0" &&
                code.charAt(pos) <= "9"
            ) {
                pos++;
            }

            var levelText = code.substring(start, pos);

            if (pos >= code.length) {
                throw new Error(
                    "Ungültiger CnCTAOpt-Code: letztes Feld ohne Typzeichen."
                );
            }

            var symbol = code.charAt(pos);
            pos++;

            cells.push({
                index: cells.length,
                row: Math.floor(cells.length / 9),
                col: cells.length % 9,
                level: levelText ? parseInt(levelText, 10) : 0,
                symbol: symbol
            });
        }

        if (cells.length !== 180) {
            throw new Error(
                "CnCTAOpt-Code enthält " +
                cells.length +
                " Rasterfelder statt 180."
            );
        }

        /*
         * Für die spätere Gebäude-Zuordnung:
         * i = row 0..19
         * j = col 0..8
         *
         * Das entspricht im CnCTAOpt-Encoder dem Zugriff [j][i].
         */
        cells.forEach(function (cell) {
            cell.gameX = cell.col;
            cell.gameY = cell.row;

            /*
             * CnCTAOpt serialisiert drei Bereiche in dasselbe 180-Feld-
             * Raster. Die Verteidigungs- und Offenseinheiten werden vom
             * Original-Encoder mit Y+8 bzw. Y+16 abgelegt.
             *
             * Für den Builder interessieren ausschließlich echte
             * Basisgebäude. In der aktuellen Spielbasis liegen diese im
             * Gebäudebereich Y=0..7.
             *
             * Wichtig: h/j/n usw. dürfen nicht allein anhand des Symbols
             * als Gebäude erkannt werden. Besonders Lv.0-Felder sind
             * Ressourcen-/Geländefelder. Ein echtes Gebäude besitzt hier
             * immer einen Level > 0.
             */
            if (
                cell.gameY <= 7 &&
                cell.level > 0 &&
                CODE_TO_NAMES[cell.symbol]
            ) {
                cell.kind = "building";
                cell.names = CODE_TO_NAMES[cell.symbol].slice();
                cell.area = "base";
            } else if (cell.symbol === ".") {
                cell.kind = "empty";
                cell.area = cell.gameY <= 7 ? "base" : "other";
            } else {
                cell.kind = "other";
                cell.area = cell.gameY <= 7 ? "base-other" : "unit/resource";
            }
        });

        return {
            raw: value,
            factionBase: factionBase,
            factionOff: factionOff,
            cityName: cityName,
            code: code,
            meta: meta,
            cells: cells
        };
    }


    function getBuildingById(id) {
        var current = getCurrentBuildings();

        for (var i = 0; i < current.length; i++) {
            if (String(current[i].id) === String(id)) {
                return current[i];
            }
        }

        return null;
    }

    function coordKey(x, y) {
        return String(x) + ":" + String(y);
    }

    function getReservedCoordinates(parsed, matches) {
        var reserved = {};

        parsed.cells.forEach(function (cell) {
            if (
                cell.kind === "building" ||
                cell.area === "base-other"
            ) {
                reserved[coordKey(cell.gameX, cell.gameY)] = true;
            }
        });

        matches.forEach(function (match) {
            reserved[coordKey(match.target.gameX, match.target.gameY)] = true;
        });

        return reserved;
    }

    function isVisuallyOccupied(x, y) {
        try {
            var visCity = ClientLib.Vis.VisMain
                .GetInstance()
                .get_City();

            if (!visCity) {
                return false;
            }

            var gridW = visCity.get_GridWidth();
            var gridH = visCity.get_GridHeight();

            if (!gridW || !gridH) {
                return false;
            }

            var cityObject = visCity.GetCityObjectFromPosition(
                x * gridW,
                y * gridH
            );

            return cityObject !== null && cityObject !== undefined;
        } catch (e) {
            return false;
        }
    }

    function findTemporaryCoordinate(parsed, matches, tried) {
        var reserved = getReservedCoordinates(parsed, matches);
        var current = getCurrentBuildings();
        var occupied = {};

        current.forEach(function (building) {
            occupied[coordKey(building.x, building.y)] = true;
        });

        tried = tried || {};

        /*
         * Wichtig: Nicht nur die gespeicherten Gebäudepositionen prüfen.
         * Die ClientLib kennt auch die tatsächliche Belegung des visuellen
         * Basisrasters. Dadurch werden Positionen übersprungen, die für das
         * Script zwar frei aussehen, vom Spiel aber tatsächlich blockiert
         * sind.
         */
        for (var y = 0; y <= 7; y++) {
            for (var x = 0; x <= 8; x++) {
                var key = coordKey(x, y);

                if (reserved[key] || occupied[key] || tried[key]) {
                    continue;
                }

                if (isVisuallyOccupied(x, y)) {
                    tried[key] = true;
                    continue;
                }

                return { x: x, y: y };
            }
        }

        return null;
    }

    function refreshMatchPositions(analysis) {
        analysis.matches.forEach(function (match) {
            var building = getBuildingById(match.building.id);

            if (building) {
                match.building = building;
            }
        });
    }

    function verifyAnalysis(analysis) {
        refreshMatchPositions(analysis);

        var correct = 0;
        var wrong = [];

        analysis.matches.forEach(function (match) {
            var building = match.building;

            if (
                building &&
                building.x === match.target.gameX &&
                building.y === match.target.gameY
            ) {
                correct++;
            } else {
                wrong.push(match);
            }
        });

        return {
            correct: correct,
            wrong: wrong,
            total: analysis.matches.length
        };
    }

    /*
     * Das CnCOpt-Layout ist die gespeicherte Zielaufstellung.
     *
     * Für das tatsächliche Verschieben verwenden wir exakt dieselbe
     * MoveBuilding-Methode wie im funktionierenden Building & Off Saver.
     *
     * Wichtig für Aufstellungen mit belegten Zielfeldern:
     * Es wird immer nur ein Zug gleichzeitig ausgeführt. Ist das Zielfeld
     * belegt, wird das dort stehende Gebäude zunächst auf eine freie
     * Zwischenposition geparkt. Danach wird der nächste Zug erneut anhand
     * der tatsächlich vorhandenen Positionen bestimmt.
     */
    function findRuntimeBuilding(buildingId) {
        var city = getCurrentCity();

        if (!city) {
            return null;
        }

        var buildings = city.get_Buildings();

        if (!buildings || !buildings.d) {
            return null;
        }

        for (var id in buildings.d) {
            var building = buildings.d[id];

            if (!building) {
                continue;
            }

            try {
                if (building.get_Id() === buildingId) {
                    return building;
                }
            } catch (e) {}
        }

        return null;
    }

    function sendMoveBuilding(building, targetX, targetY, reason) {
        var city = getCurrentCity();

        if (!city || !building) {
            return false;
        }

        var currentX = building.get_CoordX();
        var currentY = building.get_CoordY();

        if (currentX === targetX && currentY === targetY) {
            return false;
        }

        var prefix = reason ? reason + ': ' : '';

        log(
            prefix +
            'BEWEGE ID=' + building.get_Id() +
            ' (' + currentX + ':' + currentY + ') -> (' +
            targetX + ':' + targetY + ')',
            reason === 'TEMP'
                ? 'color: orange; font-weight: bold;'
                : 'color: #00ffff; font-weight: bold;'
        );

        ClientLib.Net.CommunicationManager
            .GetInstance()
            .SendCommand(
                'MoveBuilding',
                {
                    cityid: city.get_Id(),
                    posX: currentX,
                    posY: currentY,
                    targetPosX: targetX,
                    targetPosY: targetY
                },
                null,
                null,
                true
            );

        return true;
    }

    function getMoveState() {
        var occupied = {};
        var runtimeBuildings = getCurrentBuildings();

        runtimeBuildings.forEach(function (building) {
            occupied[coordKey(building.x, building.y)] = building;
        });

        return {
            occupied: occupied,
            buildings: runtimeBuildings
        };
    }

    function findMoveWithFreeTarget(moves, occupied) {
        for (var i = 0; i < moves.length; i++) {
            var move = moves[i];
            var building = getBuildingById(move.building.id);

            if (!building) {
                continue;
            }

            if (
                building.x === move.target.gameX &&
                building.y === move.target.gameY
            ) {
                continue;
            }

            var targetKey = coordKey(move.target.gameX, move.target.gameY);
            var occupant = occupied[targetKey];

            if (!occupant || occupant.id === building.id) {
                return move;
            }
        }

        return null;
    }

    function findMoveWhoseTargetIsOccupied(moves, occupied) {
        var candidates = [];

        for (var i = 0; i < moves.length; i++) {
            var move = moves[i];
            var building = getBuildingById(move.building.id);

            if (!building) {
                continue;
            }

            if (
                building.x === move.target.gameX &&
                building.y === move.target.gameY
            ) {
                continue;
            }

            var targetKey = coordKey(move.target.gameX, move.target.gameY);
            var occupant = occupied[targetKey];

            if (occupant && occupant.id !== building.id) {
                candidates.push({
                    move: move,
                    occupant: occupant
                });
            }
        }

        if (!candidates.length) {
            return null;
        }

        /*
         * Wenn mehrere Zielfelder belegt sind, bevorzugen wir einen
         * belegenden Kandidaten, dessen aktuelle Position selbst wieder
         * Ziel eines anderen noch offenen Moves ist. Damit lösen wir
         * Verschiebungsketten von ihrem Anfangspunkt aus und vermeiden,
         * dass wir irgendein Gebäude mitten aus der Kette herausparken.
         *
         * Beispiel:
         *   Bauhof 3:0 -> 0:7
         *   KW     0:5 -> 3:0
         *   KW     0:6 -> 0:5
         *   KW     0:7 -> 0:6
         *
         * Das zuerst belegte Ziel 3:0 enthält den Bauhof. Genau diesen
         * parken wir einmal. Danach kann die komplette Kette direkt
         * abgearbeitet werden.
         */
        for (var c = 0; c < candidates.length; c++) {
            var candidate = candidates[c];
            var occupantKey = coordKey(
                candidate.occupant.x,
                candidate.occupant.y
            );

            for (var m = 0; m < moves.length; m++) {
                var nextMove = moves[m];

                if (nextMove.building.id === candidate.occupant.id) {
                    continue;
                }

                var nextTargetKey = coordKey(
                    nextMove.target.gameX,
                    nextMove.target.gameY
                );

                if (nextTargetKey === occupantKey) {
                    return candidate;
                }
            }
        }

        return candidates[0];
    }

    function applyAnalysis(isUndoRestore) {
        if (APPLYING) {
            return;
        }

        if (!LAST_ANALYSIS) {
            setStatus('Bitte zuerst die Basis analysieren.', 'orange');
            return;
        }

        if (
            LAST_ANALYSIS.missing.length !== 0 ||
            LAST_ANALYSIS.unused.length !== 0
        ) {
            setStatus(
                'Aufstellung nicht anwendbar: Gebäude-Abgleich nicht vollständig.',
                'red'
            );
            return;
        }

        if (!LAST_ANALYSIS.moves || LAST_ANALYSIS.moves.length === 0) {
            setStatus(
                'Keine Änderung erforderlich. Die Basis entspricht bereits dem CnCOpt-Link.',
                'lime'
            );
            return;
        }

        // Vor jedem neuen CnCOpt-Vorgang den aktuellen Zustand als Undo-Punkt
        // speichern. Der bisherige Undo-Punkt wird dabei bewusst überschrieben.
        // Beim Wiederherstellen des Undo-Punktes wird dieser Schritt übersprungen.
        if (!isUndoRestore) {
            if (!saveOriginalLayout(false)) {
                setStatus(
                    'Aktuelle Aufstellung konnte nicht für Rückgängig gesichert werden. Vorgang abgebrochen.',
                    'red'
                );
                return;
            }
        }

        APPLYING = true;

        updateProgress(0, LAST_ANALYSIS.moves.length);

        if (APPLY_BUTTON) {
            APPLY_BUTTON.setEnabled(false);
        }
        if (ANALYZE_BUTTON) {
            ANALYZE_BUTTON.setEnabled(false);
        }

        var maxSteps = LAST_ANALYSIS.moves.length * 4 + 10;

        /*
         * Temporäre Positionen, bei denen der Server den MoveBuilding-Befehl
         * nicht übernommen hat. Diese Koordinaten werden danach nicht erneut
         * als Parkplatz verwendet.
         */
        var triedTemporaryCoordinates = {};

        function finishSuccess() {
            APPLYING = false;
            updateProgress(
                LAST_ANALYSIS.moves.length,
                LAST_ANALYSIS.moves.length
            );

            setStatus(
                'Aufstellung vollständig geladen.<br>' +
                LAST_ANALYSIS.moves.length +
                ' Abweichungen wurden abgearbeitet.',
                'lime'
            );

            log(
                'Aufstellung vollständig geladen.',
                'color: lime; font-weight: bold;'
            );

            if (APPLY_BUTTON) {
                APPLY_BUTTON.setEnabled(false);
            }
            if (ANALYZE_BUTTON) {
                ANALYZE_BUTTON.setEnabled(true);
            }
        }

        function failApply(message) {
            APPLYING = false;

            setStatus(message, 'orange');

            if (APPLY_BUTTON) {
                APPLY_BUTTON.setEnabled(true);
            }
            if (ANALYZE_BUTTON) {
                ANALYZE_BUTTON.setEnabled(true);
            }
        }

        function loadStep(step) {
            if (!APPLYING) {
                return;
            }

            if (step > maxSteps) {
                failApply(
                    'Aufstellung konnte nach ' +
                    maxSteps +
                    ' Bewegungsschritten nicht vollständig geladen werden.'
                );
                return;
            }

            try {
                var state = getMoveState();
                var moves = LAST_ANALYSIS.moves;

                /*
                 * Zuerst prüfen wir, ob überhaupt noch Gebäude falsch stehen.
                 * Dabei werden die echten aktuellen Koordinaten verwendet.
                 */
                var remaining = 0;

                moves.forEach(function (move) {
                    var building = getBuildingById(move.building.id);

                    if (
                        building &&
                        (
                            building.x !== move.target.gameX ||
                            building.y !== move.target.gameY
                        )
                    ) {
                        remaining++;
                    }
                });

                updateProgress(
                    LAST_ANALYSIS.moves.length - remaining,
                    LAST_ANALYSIS.moves.length
                );

                if (remaining === 0) {
                    finishSuccess();
                    return;
                }

                /*
                 * Fall 1: Ein Ziel ist frei.
                 * Dieses Gebäude kann direkt an seine endgültige Position.
                 */
                var directMove = findMoveWithFreeTarget(moves, state.occupied);

                if (directMove) {
                    var directBuilding = getBuildingById(directMove.building.id);

                    if (directBuilding) {
                        log(
                            'Schritt ' + step + ': Ziel frei -> ' +
                            (directMove.building.name || 'Gebäude') +
                            ' nach (' + directMove.target.gameX + ':' +
                            directMove.target.gameY + ')',
                            'color: #00ffff; font-weight: bold;'
                        );

                        sendMoveBuilding(
                            findRuntimeBuilding(directMove.building.id),
                            directMove.target.gameX,
                            directMove.target.gameY,
                            'ZIEL'
                        );
                    }

                    window.setTimeout(function () {
                        loadStep(step + 1);
                    }, 1000);

                    return;
                }

                /*
                 * Fall 2: Alle noch benötigten Zielfelder sind belegt.
                 * Dann wird der dort stehende Zielkandidat auf einen freien
                 * Zwischenplatz geparkt. Beim nächsten Schritt ist das
                 * Zielfeld frei und kann normal belegt werden.
                 */
                var blocked = findMoveWhoseTargetIsOccupied(
                    moves,
                    state.occupied
                );

                if (!blocked) {
                    failApply(
                        'Kein gültiger nächster Bewegungsschritt gefunden. ' +
                        'Bitte Basis erneut analysieren.'
                    );
                    return;
                }

                var temp = findTemporaryCoordinate(
                    LAST_ANALYSIS.parsed,
                    LAST_ANALYSIS.matches,
                    triedTemporaryCoordinates
                );

                if (!temp) {
                    failApply(
                        'Keine freie Zwischenposition zum Parken eines Gebäudes gefunden.'
                    );
                    return;
                }

                var occupantRuntime = findRuntimeBuilding(blocked.occupant.id);

                if (!occupantRuntime) {
                    failApply(
                        'Das zu parkende Gebäude ID=' +
                        blocked.occupant.id +
                        ' konnte nicht gefunden werden.'
                    );
                    return;
                }

                log(
                    'Schritt ' + step + ': Zielfeld (' +
                    blocked.move.target.gameX + ':' +
                    blocked.move.target.gameY +
                    ') ist belegt. Parke ' +
                    (blocked.occupant.name || 'Gebäude') +
                    ' auf freie Position (' + temp.x + ':' + temp.y + ').',
                    'color: orange; font-weight: bold;'
                );

                var tempKey = coordKey(temp.x, temp.y);

                sendMoveBuilding(
                    occupantRuntime,
                    temp.x,
                    temp.y,
                    'TEMP'
                );

                window.setTimeout(function () {
                    /*
                     * Nach dem MoveBuilding-Befehl die reale Position prüfen.
                     * Wurde der Parkplatz vom Server nicht übernommen, wird
                     * dieser Kandidat verworfen und im nächsten Schritt ein
                     * anderer freier Parkplatz probiert.
                     */
                    var movedRuntime = findRuntimeBuilding(
                        blocked.occupant.id
                    );

                    if (movedRuntime) {
                        var actualX = movedRuntime.get_CoordX();
                        var actualY = movedRuntime.get_CoordY();

                        if (actualX !== temp.x || actualY !== temp.y) {
                            triedTemporaryCoordinates[tempKey] = true;

                            log(
                                'TEMP: Position (' +
                                temp.x + ':' + temp.y +
                                ') wurde vom Server nicht übernommen. ' +
                                'Probiere einen anderen Parkplatz.',
                                'color: orange; font-weight: bold;'
                            );
                        }
                    }

                    loadStep(step + 1);
                }, 1000);

            } catch (e) {
                console.error(
                    '%cCNCOPT-HE AUFSTELLUNG FEHLER: ' + e.message,
                    'color: red; font-weight: bold;',
                    e
                );

                failApply(
                    'Fehler bei der Aufstellung: ' + e.message
                );
            }
        }

        loadStep(1);
    }

    function analyzeLink() {
        var link = TEXTAREA.getValue();

        try {
            var parsed = parseCncOptLink(link);
            var current = getCurrentBuildings();

            if (!current.length) {
                throw new Error(
                    "Keine Gebäude der aktuellen eigenen Basis gefunden."
                );
            }

            var targetBuildings = parsed.cells.filter(function (cell) {
                return cell.kind === "building";
            });

            var currentByKey = {};

            current.forEach(function (building) {
                var key = building.code + "|" + building.level;

                if (!currentByKey[key]) {
                    currentByKey[key] = [];
                }

                currentByKey[key].push(building);
            });

            var matches = [];
            var missing = [];

            targetBuildings.forEach(function (target) {
                var key = target.symbol + "|" + target.level;
                var list = currentByKey[key] || [];

                if (!list.length) {
                    missing.push({
                        target: target,
                        key: key
                    });
                    return;
                }

                /*
                 * Wichtig: Ein CnCTAOpt-Link beschreibt eine komplette
                 * Aufstellung. Er ist nicht automatisch ein Auftrag, alle
                 * darin enthaltenen Gebäude zu bewegen.
                 *
                 * Deshalb werden bei gleichen Gebäude-/Level-Typen zuerst
                 * diejenigen aktuellen Gebäude verwendet, die bereits exakt
                 * auf der Zielposition stehen. Nur die verbleibenden Paare
                 * können später echte Verschiebungen erzeugen.
                 */
                var exactIndex = -1;

                for (var ei = 0; ei < list.length; ei++) {
                    if (
                        list[ei].x === target.gameX &&
                        list[ei].y === target.gameY
                    ) {
                        exactIndex = ei;
                        break;
                    }
                }

                var building;

                if (exactIndex >= 0) {
                    building = list.splice(exactIndex, 1)[0];
                } else {
                    building = list.shift();
                }

                matches.push({
                    target: target,
                    building: building
                });
            });

            var unused = [];

            Object.keys(currentByKey).forEach(function (key) {
                currentByKey[key].forEach(function (building) {
                    unused.push(building);
                });
            });

            /*
             * Erst jetzt wird aus der vollständigen Zuordnung der eigentliche
             * Arbeitsauftrag gebildet. Ein unveränderter CnCOpt-Link erzeugt
             * damit exakt 0 Verschiebungen.
             */
            var moves = matches.filter(function (match) {
                return !(
                    match.building.x === match.target.gameX &&
                    match.building.y === match.target.gameY
                );
            });

            log(
                "================================================",
                "color: yellow; font-weight: bold;"
            );

            log(
                "CnCTAOpt-Analyse gestartet",
                "color: lime; font-weight: bold;"
            );

            log(
                "Basis im Link: " +
                parsed.cityName +
                " | X=" +
                (parsed.meta.X || "?") +
                " Y=" +
                (parsed.meta.Y || "?") +
                " | WID=" +
                (parsed.meta.WID || "?") +
                " | ML=" +
                (parsed.meta.ML || "?"),
                "color: white;"
            );

            var otherFields = parsed.cells.length - targetBuildings.length;

            log(
                "Aktuelle Gebäude: " +
                current.length +
                " | Ziel-Gebäude: " +
                targetBuildings.length +
                " | Andere CnCTAOpt-Felder: " +
                otherFields,
                "color: white;"
            );

            log(
                "Passende Gebäude: " +
                matches.length +
                " | Fehlend: " +
                missing.length +
                " | Übrig: " +
                unused.length,
                missing.length === 0
                    ? "color: lime; font-weight: bold;"
                    : "color: orange; font-weight: bold;"
            );

            log(
                "Tatsächliche Verschiebungen: " +
                moves.length,
                moves.length === 0
                    ? "color: lime; font-weight: bold;"
                    : "color: #00ffff; font-weight: bold;"
            );

            console.groupCollapsed(
                "%cCNCOPT-HE: Zielaufstellung",
                "color: yellow; font-weight: bold;"
            );

            targetBuildings.forEach(function (target) {
                console.log(
                    "#" +
                    target.index +
                    "  " +
                    target.symbol +
                    "  Lv." +
                    target.level +
                    "  Ziel=(" +
                    target.gameX +
                    ":" +
                    target.gameY +
                    ")  " +
                    (target.names || []).join(" / ")
                );
            });

            console.groupEnd();

            console.groupCollapsed(
                "%cCNCOPT-HE: Ausgefilterte CnCTAOpt-Felder",
                "color: #9999ff; font-weight: bold;"
            );

            parsed.cells.filter(function (cell) {
                return cell.kind !== "building" && cell.symbol !== ".";
            }).forEach(function (cell) {
                console.log(
                    "#" +
                    cell.index +
                    "  " +
                    cell.symbol +
                    "  Lv." +
                    cell.level +
                    "  Bereich=" +
                    cell.area +
                    "  Ziel=(" +
                    cell.gameX +
                    ":" +
                    cell.gameY +
                    ")"
                );
            });

            console.groupEnd();

            console.groupCollapsed(
                "%cCNCOPT-HE: Zuordnung",
                "color: cyan; font-weight: bold;"
            );

            matches.forEach(function (match) {
                console.log(
                    match.building.name +
                    " [" +
                    match.building.techName +
                    "]" +
                    " Lv." +
                    match.building.level +
                    " ID=" +
                    match.building.id +
                    "  (" +
                    match.building.x +
                    ":" +
                    match.building.y +
                    ")" +
                    "  ->  (" +
                    match.target.gameX +
                    ":" +
                    match.target.gameY +
                    ")"
                );
            });

            console.groupEnd();

            if (missing.length) {
                console.groupCollapsed(
                    "%cCNCOPT-HE: FEHLENDE Zielgebäude",
                    "color: red; font-weight: bold;"
                );

                missing.forEach(function (item) {
                    console.warn(
                        "Fehlt: Code=" +
                        item.target.symbol +
                        " Lv." +
                        item.target.level +
                        " Ziel=(" +
                        item.target.gameX +
                        ":" +
                        item.target.gameY +
                        ") " +
                        (item.target.names || []).join(" / ")
                    );
                });

                console.groupEnd();
            }

            if (unused.length) {
                console.groupCollapsed(
                    "%cCNCOPT-HE: NICHT IM ZIEL VERWENDETE GEBÄUDE",
                    "color: orange; font-weight: bold;"
                );

                unused.forEach(function (building) {
                    console.warn(
                        building.name +
                        " [" +
                        building.techName +
                        "] Lv." +
                        building.level +
                        " ID=" +
                        building.id +
                        " aktuell=(" +
                        building.x +
                        ":" +
                        building.y +
                        ")"
                    );
                });

                console.groupEnd();
            }

            LAST_ANALYSIS = {
                parsed: parsed,
                current: current,
                targetBuildings: targetBuildings,
                matches: matches,
                moves: moves,
                missing: missing,
                unused: unused
            };

            if (APPLY_BUTTON) {
                APPLY_BUTTON.setEnabled(
                    missing.length === 0 &&
                    unused.length === 0 &&
                    moves.length > 0
                );
            }

            var statusText =
                "Analyse abgeschlossen: " +
                matches.length +
                " passend, " +
                missing.length +
                " fehlend, " +
                unused.length +
                " übrig." +
                "<br>Tatsächliche Verschiebungen: " + moves.length;

            if (missing.length !== 0 || unused.length !== 0) {
                statusText += "<br>Aufstellung kann nicht angewendet werden.";
            } else if (moves.length === 0) {
                statusText += "<br>Keine Änderung erforderlich.";
            } else {
                statusText += "<br>Aufstellung kann angewendet werden.";
            }

            setStatus(
                statusText,
                missing.length === 0 && unused.length === 0
                    ? "lime"
                    : "orange"
            );

        } catch (e) {
            LAST_ANALYSIS = null;
            if (APPLY_BUTTON) {
                APPLY_BUTTON.setEnabled(false);
            }

            console.error(
                "%cCNCOPT-HE FEHLER: " + e.message,
                "color: red; font-weight: bold;",
                e
            );

            setStatus(
                "Fehler: " + e.message,
                "red"
            );
        }
    }


    // ============================================================
    // Originalaufstellung / Rückkehrpunkt
    // ============================================================

    function getOriginalStorage() {
        var raw = localStorage.harziCncOptOriginalLayouts;

        try {
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveOriginalLayout(showMessage) {
        var city = getCurrentCity();

        if (!city) {
            if (showMessage !== false) {
                setStatus('Keine eigene Basis gefunden.', 'red');
            }
            return false;
        }

        var buildings = getCurrentBuildings();

        if (!buildings.length) {
            if (showMessage !== false) {
                setStatus('Keine Gebäudeaufstellung zum Sichern gefunden.', 'orange');
            }
            return false;
        }

        var layouts = getOriginalStorage();
        var cityId = city.get_Id();

        layouts[cityId] = {
            t: new Date().getTime(),
            buildings: buildings.map(function (building) {
                return {
                    id: building.id,
                    name: building.name,
                    x: building.x,
                    y: building.y
                };
            })
        };

        localStorage.harziCncOptOriginalLayouts =
            JSON.stringify(layouts);

        if (UNDO_BUTTON) {
            UNDO_BUTTON.setEnabled(true);
        }

        if (showMessage !== false) {
            setStatus(
                'Letzte Aufstellung als Undo-Punkt gespeichert (' +
                buildings.length + ' Gebäude).',
                'lime'
            );
        }

        log(
            'Undo-Aufstellung für Basis ID=' + cityId +
            ' gespeichert (' + buildings.length + ' Gebäude).',
            'color: lime; font-weight: bold;'
        );

        return true;
    }

    function hasUndoLayout() {
        var city = getCurrentCity();

        if (!city) {
            return false;
        }

        var layouts = getOriginalStorage();
        var saved = layouts[city.get_Id()];

        return !!(
            saved &&
            saved.buildings &&
            saved.buildings.length
        );
    }

    function createOriginalAnalysis(saved) {
        var current = getCurrentBuildings();
        var currentById = {};
        var missing = [];
        var matches = [];
        var moves = [];

        current.forEach(function (building) {
            currentById[String(building.id)] = building;
        });

        saved.buildings.forEach(function (savedBuilding) {
            var building = currentById[String(savedBuilding.id)];

            var target = {
                gameX: savedBuilding.x,
                gameY: savedBuilding.y,
                symbol: '',
                level: 0,
                names: [savedBuilding.name || 'Gebäude']
            };

            if (!building) {
                missing.push({
                    target: target
                });
                return;
            }

            var match = {
                target: target,
                building: building
            };

            matches.push(match);

            if (
                building.x !== savedBuilding.x ||
                building.y !== savedBuilding.y
            ) {
                moves.push(match);
            }
        });

        // Die gespeicherten Originalpositionen werden für die gleiche
        // Parklogik wie beim CnCOpt-Anwenden als reservierte Zielfelder
        // verwendet.
        var cells = saved.buildings.map(function (building) {
            return {
                gameX: building.x,
                gameY: building.y,
                kind: 'building',
                area: 'base'
            };
        });

        return {
            parsed: {
                cells: cells
            },
            current: current,
            targetBuildings: saved.buildings,
            matches: matches,
            moves: moves,
            missing: missing,
            unused: []
        };
    }

    function restoreUndoLayout() {
        if (APPLYING) {
            return;
        }

        var city = getCurrentCity();

        if (!city) {
            setStatus('Keine eigene Basis gefunden.', 'red');
            return;
        }

        var layouts = getOriginalStorage();
        var saved = layouts[city.get_Id()];

        if (!saved || !saved.buildings || !saved.buildings.length) {
            setStatus('Für diese Basis ist keine Undo-Aufstellung gespeichert.', 'orange');
            return;
        }

        var analysis = createOriginalAnalysis(saved);

        if (analysis.missing.length) {
            setStatus(
                'Gespeicherte Undo-Aufstellung kann nicht vollständig wiederhergestellt werden: ' +
                analysis.missing.length + ' gespeicherte Gebäude fehlen.',
                'red'
            );
            return;
        }

        if (!analysis.moves.length) {
            setStatus('Die Originalaufstellung ist bereits aktiv.', 'lime');
            return;
        }

        LAST_ANALYSIS = analysis;

        setStatus(
            'Letzte Aufstellung wird wiederhergestellt...',
            'yellow'
        );

        applyAnalysis(true);
    }

    function updateProgress(done, total) {
        if (!PROGRESS_BAR || !PROGRESS_LABEL) {
            return;
        }

        total = Math.max(0, total || 0);
        done = Math.max(0, Math.min(done || 0, total));

        var percent = total > 0
            ? Math.round((done / total) * 100)
            : 0;

        // QoX-Version des Spiels besitzt hier keinen qx.ui.indicator.ProgressBar.
        // Deshalb verwenden wir eine normale Composite-Leiste.
        var barWidth = Math.round(175 * percent / 100);
        PROGRESS_BAR.getChildren()[0].setWidth(barWidth);

        if (total === 0) {
            PROGRESS_LABEL.setValue("Bereit");
        } else {
            PROGRESS_LABEL.setValue(
                done + " / " + total + " Gebäude – " + percent + " %"
            );
        }
    }

    function setStatus(text, color) {
        if (!STATUS) {
            return;
        }

        STATUS.setValue(text);
        STATUS.setTextColor(color || "white");
    }

    function closePanel() {
        if (PANEL) {
            PANEL.destroy();
            PANEL = null;
            TEXTAREA = null;
            STATUS = null;
            ANALYZE_BUTTON = null;
            APPLY_BUTTON = null;
            UNDO_BUTTON = null;
            PROGRESS_BAR = null;
            PROGRESS_LABEL = null;
            LAST_ANALYSIS = null;
            APPLYING = false;
        }
    }

    function openPanel() {
        if (PANEL) {
            closePanel();
            return;
        }

        var playArea =
            qx.core.Init
                .getApplication()
                .getPlayArea();

        PANEL =
            new qx.ui.container.Composite();

        PANEL.setLayout(
            new qx.ui.layout.Canvas()
        );

        PANEL.set({
            width: 420,
            height: 345,
            zIndex: 20000
        });

        playArea.add(
            PANEL,
            {
                right: 120,
                top: 80
            }
        );

        var title =
            new qx.ui.basic.Label(
                "CnCOpt Builder - V0.3.12"
            );

        title.set({
            width: 400,
            height: 24,
            textColor: "#FFFFFF"
        });

        PANEL.add(title, {
            left: 10,
            top: 8
        });

        // ============================================================
        // Fortschrittsbalken
        // Keine qx.ui.indicator.ProgressBar verwenden, da diese
        // Spielversion den Indicator-Namespace nicht bereitstellt.
        // ============================================================
        PROGRESS_BAR =
            new qx.ui.container.Composite();

        PROGRESS_BAR.setLayout(
            new qx.ui.layout.Canvas()
        );

        PROGRESS_BAR.set({
            width: 135,
            height: 22,
            backgroundColor: "#202020"
        });

        var progressFill =
            new qx.ui.container.Composite();

        progressFill.setLayout(
            new qx.ui.layout.Canvas()
        );

        progressFill.set({
            width: 0,
            height: 22,
            backgroundColor: "#36A84A"
        });

        PROGRESS_BAR.add(progressFill, {
            left: 0,
            top: 0
        });

        PANEL.add(PROGRESS_BAR, {
            left: 150,
            top: 8
        });

        PROGRESS_LABEL =
            new qx.ui.basic.Label("Bereit");

        PROGRESS_LABEL.set({
            width: 135,
            height: 22,
            textAlign: "center",
            textColor: "#FFFFFF",
            rich: true
        });

        PANEL.add(PROGRESS_LABEL, {
            left: 150,
            top: 8
        });

        TEXTAREA =
            new qx.ui.form.TextArea();

        TEXTAREA.set({
            width: 400,
            height: 150,
            placeholder:
                "CnCTAOpt-Link hier einfügen..."
        });

        PANEL.add(TEXTAREA, {
            left: 10,
            top: 35
        });

        ANALYZE_BUTTON =
            new qx.ui.form.Button(
                "Basis analysieren"
            );

        var analyzeButton = ANALYZE_BUTTON;

        analyzeButton.set({
            width: 150,
            height: 28
        });

        PANEL.add(analyzeButton, {
            left: 10,
            top: 192
        });

        analyzeButton.addListener(
            "execute",
            analyzeLink
        );

        APPLY_BUTTON =
            new qx.ui.form.Button(
                "Aufstellung anwenden"
            );

        APPLY_BUTTON.set({
            width: 150,
            height: 28
        });

        PANEL.add(APPLY_BUTTON, {
            left: 10,
            top: 225
        });

        APPLY_BUTTON.setEnabled(false);
        APPLY_BUTTON.addListener(
            "execute",
            applyAnalysis
        );

        // ============================================================
        // Undo / Rückgängig
        // ============================================================

        UNDO_BUTTON =
            new qx.ui.form.Button(
                "↶ Rückgängig"
            );

        UNDO_BUTTON.set({
            width: 115,
            height: 28
        });

        PANEL.add(UNDO_BUTTON, {
            left: 170,
            top: 192
        });

        UNDO_BUTTON.setEnabled(
            hasUndoLayout()
        );

        UNDO_BUTTON.addListener(
            "execute",
            restoreUndoLayout
        );

        var closeButton =
            new qx.ui.form.Button(
                "Schließen"
            );

        closeButton.set({
            width: 100,
            height: 28
        });

        PANEL.add(closeButton, {
            left: 170,
            top: 225
        });

        closeButton.addListener(
            "execute",
            closePanel
        );

        STATUS =
            new qx.ui.basic.Label(
                "Bitte CnCOpt-Link einfügen und zuerst analysieren."
            );

        STATUS.set({
            width: 395,
            height: 55,
            rich: true,
            wrap: true,
            textColor: "#FFFFFF"
        });

        PANEL.add(STATUS, {
            left: 10,
            top: 265
        });
    }

    function findRepairButton(widget) {
        if (!widget || !widget.getChildren) {
            return null;
        }

        var children = widget.getChildren();

        for (var i = 0; i < children.length; i++) {
            var child = children[i];

            try {
                if (
                    child.getLabel &&
                    child.getLabel() === "Alles reparieren"
                ) {
                    return child;
                }
            } catch (e) {}

            var found = findRepairButton(child);

            if (found) {
                return found;
            }
        }

        return null;
    }

    function createButton() {
        try {
            if (CNCOPT_BUTTON) {
                return;
            }

            var playArea =
                qx.core.Init
                    .getApplication()
                    .getPlayArea();

            var repairButton =
                findRepairButton(playArea);

            if (!repairButton) {
                window.setTimeout(createButton, 2000);
                return;
            }

            var parent =
                repairButton.getLayoutParent();

            if (parent) {
                parent =
                    parent.getLayoutParent();
            }

            if (!parent) {
                window.setTimeout(createButton, 2000);
                return;
            }

            CNCOPT_BUTTON =
                new qx.ui.form.Button(
                    "CncOpt"
                );

            CNCOPT_BUTTON.set({
                width: 100,
                height: 40,
                appearance: "button-text-small"
            });

            parent.add(
                CNCOPT_BUTTON,
                {
                    right: 105,
                    top: 75
                }
            );

            CNCOPT_BUTTON.addListener(
                "execute",
                openPanel
            );

            // ========================================================
            // Sichtbarkeit nach Spielmodus
            // Wie im funktionierenden Building & Off-Saver.
            // ========================================================
            BUILDING_MODE_TIMER =
                window.setInterval(function () {
                    try {
                        var currentMode =
                            ClientLib.Vis.VisMain
                                .GetInstance()
                                .get_Mode();

                        if (currentMode === 1) {
                            // Gebäudemodus
                            CNCOPT_BUTTON.show();
                        } else {
                            // Gebäudeansicht verlassen:
                            // geöffnete CncOpt-Anzeige schließen
                            // und den Button ausblenden.
                            if (PANEL) {
                                closePanel();
                            }

                            CNCOPT_BUTTON.exclude();
                        }
                    } catch (e) {}
                }, 500);

            log(
                "CnCOpt Builder V0.3.9 geladen.",
                "color: lime; font-weight: bold;"
            );

        } catch (e) {
            window.setTimeout(createButton, 2000);
        }
    }

    function init() {
        if (
            typeof qx === "undefined" ||
            !qx.core ||
            !qx.core.Init
        ) {
            window.setTimeout(init, 1000);
            return;
        }

        createButton();
    }

    init();

})();
