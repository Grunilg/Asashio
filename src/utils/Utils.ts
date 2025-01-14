import { Guild, Message, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, Snowflake } from "discord.js"
import log4js from "log4js"
import fetch, { Response } from "node-fetch"
import emoji from "../data/emoji.json"
import config from "../data/config.json"
import client from "./../main"
import { Cache, Cached, CommandSource, Damages, DamageType, DBType, DropData, NameTable, padding, Rank, SendMessage, Ship, ShipExtended, Stages } from "./Types"

const Logger = log4js.getLogger("Utils")

export const PAD_START = 0
export const PAD_END = 1


export function getWiki(page: string): string {
    return `https://en.kancollewiki.net/${page.replace(/ /g, "_")}`
}

export function fetchKcnav(endpoint: string): Promise<Response> {
    let headers = {};
    if (config.kcnav.auth_token)
        headers = {Authorization: 'Bearer ' + config.kcnav.auth_token};
    return fetch("https://tsunkit.net" + endpoint, {headers})
}

export function createTable(names: NameTable | undefined, rows: (string | undefined)[][], pads: padding[] = [PAD_END]): string {
    const maxColumns = Math.max(...rows.map(row => row.length))
    let title = "", currentInd = 0

    for (let i = 0; i < maxColumns; i++) {
        if (names && names[i])
            title = title.padEnd(currentInd) + names[i]

        const maxLength = Math.max(...rows.map(row => row.length > i ? (row[i]?.toString() ?? "").length : 0), (names && names[i + 1]) ? (title.length - currentInd) : 0)
        currentInd += 1 + maxLength

        rows.forEach(row => {
            if (row.length <= i) return

            const padEnd = pads.length > i ? pads[i] : pads[pads.length - 1]
            row[i] = padEnd ? (row[i] ?? "?").toString().padEnd(maxLength) : (row[i] ?? "?").toString().padStart(maxLength)
        })
    }

    const table = rows.map(row => row.join(" ").replace(/\s+$/, ""))
    if (names)
        return [title, ...table].join("\n")
    else
        return table.join("\n")
}

export function handleShip(ship: ShipExtended): ShipExtended {
    const { data } = client

    ship.hp_married = Math.min(ship.hp_max, ship.hp + [4, 4, 4, 5, 6, 7, 7, 8, 8, 9][Math.floor(ship.hp/10)])
    ship.ship_type = `${data.misc.ShipTypes[ship.type]} (${data.misc.ShipCodes[ship.type]})`

    for (const key of ["asw", "evasion", "los"]) {
        if (ship[key] != undefined && ship[`${key}_max`] != undefined)
            ship[`${key}_ring`] = ship[key] + Math.floor((ship[`${key}_max`] - ship[key]) / 99 * data.getMaxLevel())
        else
            ship[`${key}_ring`] = "??"
        if (ship[key] == undefined) ship[key] = "??"
        if (ship[`${key}_max`] == undefined) ship[`${key}_max`] = "??"
    }

    for (const key of ["firepower", "torpedo", "aa", "armor", "luck", "asw", "evasion", "los"]) {
        if (ship[key] === false) ship[key] = 0
        if (ship[`${key}_max`] === false) ship[`${key}_max`] = 0
    }

    ship.speed_name = data.misc.SpeedNames[ship.speed]
    ship.range_name = data.misc.RangeNames[ship.range]
    ship.rarity_name = data.misc.RarityNames[ship.rarity]

    ship.mods = [ship.firepower_mod || 0, ship.torpedo_mod || 0, ship.aa_mod || 0, ship.armor_mod || 0].join("/")
    ship.scraps = [ship.scrap_fuel || 0, ship.scrap_ammo || 0, ship.scrap_steel || 0, ship.scrap_bauxite || 0].join("/")

    if (ship.equipment) {
        ship.aircraft = ship.equipment.map(equip => equip.size).reduce((a, b) => a + b, 0)
        ship.equipment_text = ship.equipment.map(equip => `• ${ship.aircraft > 0 ? `${equip.size}${emoji.plane} `:""}${equip.equipment == undefined ? "??" : equip.equipment ? equip.equipment : "None"}${(equip.stars && equip.stars > 0) ? ` ${emoji.star}+${equip.stars}`:""}`).join("\n")
    }

    if (ship.remodel_level) {
        ship.remodel_text = "Remodel requires: "
        const requirements = [`Lv.${ship.remodel_level}.`]
        const k = (remodel: number|true): number => remodel == true ? 1 : remodel

        if (ship.remodel_ammo) requirements.push(`${ship.remodel_ammo}×${emoji.ammo}`)
        if (ship.remodel_steel) requirements.push(`${ship.remodel_steel}×${emoji.steel}`)
        if (ship.remodel_development_material) requirements.push(`${k(ship.remodel_development_material)}×${emoji.devmat}`)
        if (ship.remodel_construction_material) requirements.push(`${k(ship.remodel_construction_material)}×${emoji.flamethrower}`)
        if (ship.remodel_blueprint) requirements.push(`${k(ship.remodel_blueprint)}×${emoji.blueprint}`)
        if (ship.remodel_report) requirements.push(`${k(ship.remodel_report)}×${emoji.action_report}`)
        if (ship.remodel_catapult) requirements.push(`${k(ship.remodel_catapult)}×${emoji.catapult}`)
        if (ship.remodel_gunmat) requirements.push(`${k(ship.remodel_gunmat)}×${emoji.gun_mat}`)
        if (ship.remodel_airmat) requirements.push(`${k(ship.remodel_airmat)}×${emoji.air_mat}`)

        ship.remodel_text += requirements.join(", ")
    } else
        ship.remodel_text = "Lv.1"

    ship.class_description = `${ship.class}${ship.class_number === false ? "" : ` Class #${ship.class_number}`}`
    return ship
}

export function displayShip(ship: ShipExtended): MessageEmbed {
    const embed = new MessageEmbed()
        .setTitle([`No. ${ship.id} (api id: ${ship.api_id})`, ship.full_name, ship.japanese_name, /* ship.reading,*/ ship.rarity_name].filter(a => a).join(" | "))

    if (typeof ship.api_id == "number")
        embed.setURL(getWiki(ship.name))
            .setThumbnail(`https://raw.githubusercontent.com/KC3Kai/KC3Kai/develop/src/assets/img/ships/${ship.api_id}.png`)
    // TODO rarity color? .setColor("#")

    embed.setDescription(`${ship.class_description} | ${ship.ship_type}`)

    embed.addField("Stats", `\`\`\`asciidoc
HP        :: ${ship.hp} [${ship.hp_married}] (cap ${ship.hp_max})
Firepower :: ${ship.firepower} (${ship.firepower_max})
Torpedo   :: ${ship.torpedo} (${ship.torpedo_max})
AA        :: ${ship.aa} (${ship.aa_max})
Armor     :: ${ship.armor} (${ship.armor_max})
Luck      :: ${ship.luck} (${ship.luck_max})
ASW       :: ${ship.asw} (${ship.asw_max}) [${ship.asw_ring}]
Evasion   :: ${ship.evasion} (${ship.evasion_max}) [${ship.evasion_ring}]
LOS       :: ${ship.los} (${ship.los_max}) [${ship.los_ring}]
Speed     :: ${ship.speed_name}
Range     :: ${ship.range_name}
Fuel      :: ${ship.fuel}
Ammo      :: ${ship.ammo}
Mod       :: ${ship.mods}
Scrap     :: ${ship.scraps}
\`\`\``)

    if (ship.equipment)
        embed.addField("Equipment", ship.equipment_text ? ship.equipment_text : "No equipment slots")

    if (ship.remodel_text)
        embed.addField("Remodel", ship.remodel_text)

    return embed
}

export function aswAtLevel(ship: Ship, level: number): number {
    if (ship.asw_max == false) return 0
    return Math.floor(ship.asw + ((ship.asw_max - ship.asw) * level / 99))
}

export function evasionAtLevel(ship: Ship, level: number): number {
    if (ship.evasion_max == false) return 0
    return Math.floor(ship.evasion + ((ship.evasion_max - ship.evasion) * level / 99))
}

export function losAtLevel(ship: Ship, level: number): number {
    if (ship.los_max == false) return 0
    return Math.floor(ship.los + ((ship.los_max - ship.los) * level / 99))
}

const compare = {
    min: (a: number, b: number): number => {
        if (isNaN(a)) return b
        if (isNaN(b)) return a
        if (a == 0 || b == 0)
            return 0
        return Math.min(a || b, b || a)
    },
    max: (a: number, b: number): number => {
        if (isNaN(a)) return b
        if (isNaN(b)) return a
        return Math.max(a || b, b || a)
    }
}


const calculateDamagesDone = (atk: number, currenthp: number, armor: number, maxhp: number, overkillprot = currenthp > 0.25 * maxhp && maxhp < 200): DamageType => {
    const dmgtype: DamageType = {
        "scratch": 0,
        "normal": 0,
        "overkill": 0,
        "damages": []
    }
    const damages: Damages = {}
    for (let arm = 0; arm < armor; arm++) {
        const dmg = Math.floor((atk - (0.7 * armor + arm * 0.6)))

        if (dmg >= currenthp && overkillprot) { // Overkill protection
            const possibledmg = []
            for (let hpRoll = 0; hpRoll < currenthp; hpRoll++)
                possibledmg.push(Math.floor(0.5 * currenthp + 0.3 * hpRoll))
            for (const posdmg of possibledmg)
                damages[posdmg] = (damages[posdmg] ?? 0) + (1.0 / possibledmg.length)
            dmgtype.overkill = (dmgtype.overkill ?? 0) + 1.0
        } else if (dmg < 1) { // Scratch
            const possibledmg = []
            for (let hpRoll = 0; hpRoll < currenthp; hpRoll++)
                possibledmg.push(Math.floor(0.06 * currenthp + 0.08 * hpRoll))
            for (const posdmg of possibledmg)
                damages[posdmg] = (damages[posdmg] ?? 0) + (1.0 / possibledmg.length)
            dmgtype.scratch = (dmgtype.scratch ?? 0) + 1.0
        } else {
            damages[dmg] = (damages[dmg] ?? 0) + 1.0
            dmgtype.normal = (dmgtype.normal ?? 0) + 1.0
        }
    }
    dmgtype.damages = damages
    return dmgtype
}

export function calculatePostCap(atk: number, currenthp: number, maxhp: number, armor: number, calculatedDamage = calculateDamagesDone(atk, currenthp, armor, maxhp)): Stages {
    let sum = 0
    const dmgsDealth: Damages = calculatedDamage.damages
    for (const posdmg in dmgsDealth)
        sum += dmgsDealth[posdmg]

    const stages: Stages = {
        "sunk": 0,
        "taiha": 0,
        "chuuha": 0,
        "shouha": 0,
        "ok": 0,
        "overkill": 0,
        "normal": 0,
        "scratch": 0,
        "hps": [],
        "minhp": 9999,
        "maxhp": 0,
        "mindmg": 9999,
        "maxdmg": 0
    }

    for (const posdmg in dmgsDealth) {
        const ch = dmgsDealth[posdmg], afterhp = currenthp - (+posdmg)
        if (ch == 0) continue
        stages.hps[afterhp] = ch / sum
        if (afterhp <= 0)
            stages.sunk += ch / sum
        else if (afterhp <= .25 * maxhp)
            stages.taiha += ch / sum
        else if (afterhp <= .50 * maxhp)
            stages.chuuha += ch / sum
        else if (afterhp <= .75 * maxhp)
            stages.shouha += ch / sum
        else
            stages.ok += ch / sum

        stages.minhp = compare.min(stages.minhp, afterhp < 0 ? 0 : afterhp)
        stages.mindmg = compare.min(stages.mindmg, +posdmg)
        stages.maxhp = compare.max(stages.maxhp, afterhp < 0 ? 0 : afterhp)
        stages.maxdmg = compare.max(stages.maxdmg, +posdmg)
    }
    stages.overkill += calculatedDamage.overkill / sum
    stages.normal += calculatedDamage.normal / sum
    stages.scratch += calculatedDamage.scratch / sum
    return stages
}

const shipDropCache: Cached = {}
function getDisplayDropString(cached: Cache, db: DBType, notice = true, dmChannel = false): string {
    if (cached.error) return "An error has occurred while fetching data. Try again later, if it still fails, try to contact me (see `.credits`)."
    let drops = Object.values(cached.dropData).sort((a, b) => b.totalDrops - a.totalDrops)
    if (drops.length == 0)
        return `No ${cached.rank} rank **${cached.ship.full_name}** drops found`

    const totalCount = drops.length
    drops = dmChannel ? drops.slice(0, 35) : drops.slice(0, 10)

    let dropTable = createTable(
        { 0: "Map", 4: "Rate" },
        drops.map(drop => [drop.map + drop.node, "|", ["/", "C", "E", "M", "H"][drop.difficulty], "|", `${drop.rateTotal} ${drop.samplesTotal}`]),
        [PAD_END, PAD_END, PAD_END, PAD_END, PAD_END]
    )

    if (db == "tsundb")
        if (!(drops.map(drop => drop.samples0).filter(k => k != "[0/0]").length == 0 && drops.map(drop => drop.samples1).filter(k => k != "[0/0]").length == 0)) {
            drops = drops.slice(0, 20)
            dropTable = createTable(
                {
                    0: "Map",
                    4: "Rate first",
                    6: " ",
                    7: "Rate first dupe",
                    9: " ",
                    10: "Rate >1 dupe"
                }, drops.map(drop => [
                    drop.map + drop.node, "|",
                    ["/", "C", "E", "M", "H"][drop.difficulty], "|",
                    drop.rate0, drop.samples0, "|",
                    drop.rate1, drop.samples1, "|",
                    drop.rateRem, drop.samplesRem
                ]),
                [PAD_END, PAD_END, PAD_END, PAD_END, PAD_START, PAD_END, PAD_END, PAD_START, PAD_END, PAD_END, PAD_START, PAD_END]
            )
        }

    let dropString = `Found following drops for **${cached.ship.full_name}** (${cached.rank} rank): \`\`\`
${dropTable}\`\`\``

    // Add small drop size notice
    if (notice) {
        dropString += `*Please note that some smaller sample size results may be inaccurate.*
`
    }

    // Add rows shown notice
    if (drops.length < totalCount) {
        if (dmChannel) {
            dropString += `Shown top ${drops.length}/${totalCount} rows. `
        } else {
            dropString += `Shown top ${drops.length}/${totalCount} rows. Redo a .drop command in DM for more. `
        }
    }

    // Add data notice
    if (notice) {
        dropString += `Data from ${db == "tsundb" ? `TsunDB on ${new Date(cached.time).toLocaleString("en-UK", {
            timeZone: "GMT",
            timeZoneName: "short",
            hour12: false,
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })}` : `poi-statistics on ${cached.generateTime}`}`
    }
    return dropString
}

function getDisplayDataString(cached: Cache, db: DBType, notice = false, dmChannel = false, oldCache?: Cache): string {
    if (cached == undefined || cached.dropData == undefined || cached.loading) {
        if (!(oldCache == undefined || oldCache.dropData == undefined || oldCache.loading)) {
            return `${emoji.loading} Updating ${cached.ship.full_name} drop data... Old data:

${getDisplayDropString(oldCache, db, notice, dmChannel)}`
        }

        return `${emoji.loading} Loading ${cached.ship.full_name} drop data...`
    }

    return getDisplayDropString(cached, db, notice, dmChannel)
}

const displayData = async (cached: Cache, reply: SendMessage, db: DBType, dmChannel: boolean): Promise<void> => {
    try {
        await updateMessage(reply, getDisplayDataString(cached, db, true, dmChannel))
    } catch (error) {
        Logger.error(error)
    }
}

export function percentage(count: number, total: number): string {
    if (total === 0) return "?.???%"
    return (count / total * 100).toFixed(3) + "%"
}

const queue = async (ship: Ship, rank: Rank, cached: Cache, db: DBType = "tsundb"): Promise<{ [key: string]: DropData }> => {
    const api = db === "tsundb"
        ? await (await fetchKcnav(`/api/routing/quickdrops?shipId=${ship.api_id}&ranks=${rank}&includeOldEvents=false`)).json()
        : await (await fetch(`https://db.kcwiki.org/drop/ship/${ship.api_id}/${rank}.json`)).json()
    if (api.error) {
        Logger.error(`An error has occurred while fetching drop ${ship.api_id}/${rank} @ ${db}: ${api.error}`)
        delete cached.loading
        cached.error = true
        Promise.all(cached.callback?.map(async k => k()) ?? []).catch(e => Logger.error(e))
        delete cached.callback
        return {}
    }

    if (db == "tsundb") {
        for (const entry of api.result) {
            // eslint-disable-next-line prefer-const
            let { map, node, difficulty } = entry

            if (parseInt(map.split("-")[0]) > 20) {
                // Ignore old event IDs
                if (map.split("-")[0] != client.data.eventID()) continue
                map = "E-" + map.split("-")[1]
            }
            difficulty = difficulty ?? 0

            const drops_zero = entry.drops_zero ?? 0, runs_zero = entry.runs_zero ?? 0
            const drops_one = entry.drops_one ?? 0, runs_one = entry.runs_one ?? 0
            const drops = entry.drops ?? 0, runs = entry.runs ?? 0
            const remaining = drops - drops_one - drops_zero, remainingRuns = runs - runs_one - runs_zero

            const dropData: DropData = {
                map,
                difficulty,
                node,
                rank,
                "rate0": percentage(drops_zero, runs_zero),
                "samples0": `[${drops_zero}/${runs_zero}]`,
                "rate1": percentage(drops_one, runs_one),
                "samples1": `[${drops_one}/${runs_one}]`,
                "rateTotal": percentage(drops, runs),
                "samplesTotal": `[${drops}/${runs}]`,
                "rateRem": percentage(remaining, remainingRuns),
                "samplesRem": `[${remaining}/${remainingRuns}]`,
                "totalDrops": entry.drops ?? 0
            }
            cached.dropData[entry.map + node + difficulty] = dropData
        }
    } else if (db == "poi") {
        for (const location in api.data) {
            const entry = api.data[location]

            // eslint-disable-next-line prefer-const
            let [world, map, node, difficulty] = location.split("-")

            node = node.replace("(Boss)", "").trim()
            if (parseInt(world) > 20)
                map = `E-${map}`
            else
                map = `${world}-${map}`

            cached.dropData[entry.map + node + difficulty] = {
                map,
                difficulty: [" ", "丁", "丙", "乙", "甲"].indexOf(difficulty || " "),
                node,
                rank,
                "rateTotal": `${parseFloat(entry.rate).toFixed(3)}%`,
                "samplesTotal": `[${entry.totalCount} dropped]`,
                "totalDrops": entry.totalCount
            }
        }
    }
    delete cached.loading
    cached.generateTime = api.generateTime
    Promise.all(cached.callback?.map(async k => k()) ?? []).catch(e => Logger.error(e))
    delete cached.callback

    return cached.dropData
}

export function parseDropArgs(args: string[]): {rank: Rank, ship: Ship} | string {
    if (!args || args.length < 1) return "Must provide a ship."

    let rank: Rank = "S"
    if (args[args.length - 1].toUpperCase() == "S") {
        args.pop()
        rank = "S"
    } else if (args[args.length - 1].toUpperCase() == "B") {
        args.pop()
        rank = "B"
    } else if (args[args.length - 1].toUpperCase() == "A") {
        args.pop()
        rank = "A"
    }

    const shipName = args.join(" ")
    const ship = client.data.getShipByName(shipName)

    if (ship == undefined) return "Unknown ship"

    return {
        rank, ship
    }
}

export async function dropTable(source: CommandSource, ship: Ship, rank: Rank, db: DBType = "tsundb"): Promise<SendMessage | undefined> {
    const dmChannel = source.channel?.type == "DM"
    if (ship.remodel_from && typeof ship.remodel_from == "string")
        ship = client.data.getShipByName(ship.remodel_from.replace("/", "")) ?? ship
    ship = client.data.getShipByName(ship.name)

    // Check if cached, if so show cached reply.
    const cached = shipDropCache[db + ship.api_id + rank]
    if (cached && cached.time + 1 * 60 * 60 * 1000 > new Date().getTime()) {
        const reply = await sendMessage(source, getDisplayDataString(cached, db, true, dmChannel))
        if (cached.callback && reply)
            cached.callback.push(async () => displayData(cached, reply, db, dmChannel))
        return reply
    }

    const startTime = new Date()
    const dropData = {}

    // Not cached, add it
    const newcached: Cache = shipDropCache[db + ship.api_id + rank] = {
        time: startTime.getTime(),
        dropData,
        ship,
        rank,
        loading: true,
        callback: []
    }
    const reply = await sendMessage(source, getDisplayDataString(newcached, db, true, dmChannel, cached))
    if (reply)
        newcached.callback?.push(async () => displayData(newcached, reply, db, dmChannel))
    queue(ship, rank, newcached, db).catch(e => Logger.error(e))
    return reply
}

export async function sendToChannels(channels: Snowflake[] | undefined, content?: string, embed?: MessageEmbed): Promise<PromiseSettledResult<Message | Message[]>[]> {
    const messages = []
    if (!channels) return Promise.all([])

    for (const channel of channels) {
        try {
            const chanObj = await client.channels.fetch(channel)
            if (!(chanObj && chanObj.isText()))
                continue
            if (embed && content && content.length > 0)
                messages.push(chanObj.send({ content, embeds: [embed] }))
            else if (embed)
                messages.push(chanObj.send({ embeds: [embed] }))
            else if (content)
                messages.push(chanObj.send(content))
        } catch (error) {
            Logger.error(`Failed to fetch ${channel}`)
        }
    }

    return Promise.allSettled(messages)
}

export async function sendMessage(source: CommandSource, response: string | MessageEmbed, options: {
    files?: MessageAttachment[]
    components?: (MessageActionRow)[]
    ephemeral?: boolean
} = {}): Promise<SendMessage | undefined> {
    let embeds: MessageEmbed[] | undefined
    let content: string | undefined

    if (typeof response == "string")
        content = response
    else
        embeds = [response]

    if (!options.components && !(options.ephemeral && !(source instanceof Message)) && source.channel?.type != "DM")
        options.components = [getDeleteButton()]

    try {
        if (source instanceof Message)
            return await source.channel.send({ content, embeds, components: options.components, files: options.files })
        else
            return await source.reply({ content, embeds, components: options.components, files: options.files, fetchReply: true, ephemeral: options.ephemeral })
    } catch (error) {
        Logger.error("sendMessage", error)
    }
}
export async function updateMessage(update: SendMessage, edit: string | {
    content: string
    embeds?: (MessageEmbed)[] | null
    files?: MessageAttachment[]
}): Promise<void> {
    if (update instanceof Message) {
        await update.edit(edit)
    } else {
        Logger.info("Unable to edit")
    }
}


export function getDeleteButton(): MessageActionRow {
    const row = new MessageActionRow()

    row.addComponents(
        new MessageButton()
            .setCustomId("delete")
            .setLabel("Delete")
            .setStyle("DANGER")
            .setEmoji("✖️"),
    )
    return row
}
export function isMessage(msg: SendMessage | CommandSource | undefined): msg is Message {
    return msg instanceof Message
}
export function getUserID(source: CommandSource): string {
    if (isMessage(source))
        return source.author.id
    else
        return source.user.id
}
export function findFuzzy(target: string[], search: string): string | undefined {
    const cleaned = searchClean(search)
    const found = target.find(t => searchClean(t) == search)
    if (found)
        return found

    const dists = target.map(e => fuzzySearchScore(searchClean(e), cleaned) + fuzzySearchScore(caps(e), caps(search)))
    const max = Math.max(...dists)

    let candidates = target.filter((_, index) => dists[index] == max)

    let filteredCandidates = candidates.filter(t => searchClean(t).startsWith(cleaned.substring(0, 3)) || searchClean(t).endsWith(cleaned.substring(cleaned.length - 3)))
    if (filteredCandidates.length != 0) candidates = filteredCandidates

    filteredCandidates = candidates.filter(t => caps(t).includes(search[0].toUpperCase()))
    if (filteredCandidates.length != 0) candidates = filteredCandidates

    filteredCandidates = candidates.filter(t => caps(t) == caps(search))
    if (filteredCandidates.length != 0) candidates = filteredCandidates

    const lengths = candidates.map(t => t.length)
    const min = Math.min(...lengths)
    return candidates[lengths.indexOf(min)]
}

export function findFuzzyBestCandidates(target: string[], search: string, amount: number): string[] {
    const cleaned = searchClean(search)
    const found = target.find(t => searchClean(t) == search)
    if (found)
        return [found]

    const dists = target.map(e => fuzzySearchScore(searchClean(e), cleaned) + fuzzySearchScore(caps(e), caps(search)) - e.length / 100 + 1)
    const max = Math.max(...dists)

    return target
        .map((t, i) => {
            return {
                t,
                d: dists[i]
            }
        })
        .sort((a, b) => b.d - a.d)
        .filter((e, i) => i < amount && e.d > max * 0.65)
        .map(({ t, d }) => {
            if (searchClean(t).startsWith(cleaned.substring(0, 3)) || searchClean(t).endsWith(cleaned.substring(cleaned.length - 3)))
                d += 1
            if (caps(t).includes(search[0]?.toUpperCase()))
                d += 1.5
            if (caps(t) == caps(search))
                d += 0.5

            return { t, d }
        })
        .sort((a, b) => b.d - a.d)
        .map(e => e.t)
}
export function fuzzySearchScore(a: string, b: string): number {
    if (a.length == 0) return 0
    if (b.length == 0) return 0

    // swap to save some memory O(min(a,b)) instead of O(a)
    if (a.length > b.length) [a, b] = [b, a]

    const row = []
    // init the row
    for (let i = 0; i <= a.length; i++)
        row[i] = i


    // fill in the rest
    for (let i = 1; i <= b.length; i++) {
        let prev = i
        for (let j = 1; j <= a.length; j++) {
            const val = (b.charAt(i - 1) == a.charAt(j - 1)) ? row[j - 1] : Math.min(row[j - 1] + 1, prev + 1, row[j] + 1)
            row[j - 1] = prev
            prev = val
        }
        row[a.length] = prev
    }

    return b.length - row[a.length]
}

function searchClean(str: string): string {
    return str.toLowerCase().replace(/'/g, "")
}
function caps(str: string): string {
    return str.split("").filter(k => k != k.toLowerCase()).join("")
}

export function displayTimestamp(time: Date, display = "R"): string {
    return `<t:${Math.floor(time.getTime() / 1000)}:${display}>`
}


export async function changeName(guilds: Guild[], check: (guild: Guild) => boolean, name: string): Promise<void> {
    for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i]

        if (!check(guild)) continue
        Logger.info(`Changing name in ${guild.name} to ${name}`)
        await guild.me?.setNickname(name)
        await new Promise(res => setTimeout(res, 30000))
    }
}

export function shiftDate(date: Date, time: number): Date {
    date.setUTCDate(date.getUTCDate() + time)
    return date
}
export function shiftMonth(date: Date, time: number): Date {
    date.setUTCMonth(date.getUTCMonth() + time)
    return date
}
export function shiftHour(date: Date, time: number): Date {
    date.setUTCHours(date.getUTCHours() + time)
    return date
}
export function shiftMinute(date: Date, time: number): Date {
    date.setUTCMinutes(date.getUTCMinutes() + time)
    return date
}
