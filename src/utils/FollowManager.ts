import SQLite from "better-sqlite3"
import { Channel, Guild, Message, MessageEmbed, Snowflake } from "discord.js"
import { ensureDirSync } from "fs-extra"
import log4js from "log4js"
import { FollowCategory, Follower } from "./Types"
import { sendToChannels } from "./Utils"


const Logger = log4js.getLogger("FollowManager")
ensureDirSync("data/")

export default class FollowManager {
    sql = new SQLite("data/follows.db")

    constructor() {
        Logger.info("Initializing data")
        process.on("exit", () => this.sql.close())
        process.on("SIGHUP", () => process.exit(128 + 1))
        process.on("SIGINT", () => process.exit(128 + 2))
        process.on("SIGTERM", () => process.exit(128 + 15))

        this.sql.prepare("CREATE TABLE IF NOT EXISTS follows (guildID TEXT, channelID TEXT, category TEXT, filter TEXT, addedOn BIGINT, addedBy TEXT, PRIMARY KEY (channelID, category, filter))").run()

        this.addFollowStatement = this.sql.prepare("INSERT OR REPLACE INTO follows VALUES (@guildID, @channelID, @category, @filter, @addedOn, @addedBy)")

        this.getFollowsStatement = this.sql.prepare("SELECT * FROM follows WHERE category = @category AND channelID = @channelID")
        this.getFollowsInChannelStatement = this.sql.prepare("SELECT * FROM follows WHERE channelID = @channelID")
        this.followingStatement = this.sql.prepare("SELECT category, channelID, COUNT(filter) AS amount FROM follows WHERE guildID = @guildID GROUP BY category, channelID")
        this.getFollowersStatement = this.sql.prepare("SELECT channelID FROM follows WHERE category = @category AND filter = @filter")
        this.followsStatement = this.sql.prepare("SELECT channelID FROM follows WHERE category = @category AND filter = @filter AND channelID = @channelID")

        this.unfollowsStatement = this.sql.prepare("DELETE FROM follows WHERE category = @category AND filter = @filter AND channelID = @channelID")
        this.dropChannelStatement = this.sql.prepare("DELETE FROM follows WHERE channelID = @channelID")
        this.dropChannelCategoryStatement = this.sql.prepare("DELETE FROM follows WHERE channelID = @channelID AND category = @category")
        this.dropGuildStatement = this.sql.prepare("DELETE FROM follows WHERE guildID = @guildID")
    }

    private addFollowStatement: SQLite.Statement
    addFollow(guild: Guild, channel: Channel, category: FollowCategory, addedBy: string, filter = "*"): void {
        Logger.info(`Following ${filter} in ${category} for ${addedBy} in ${channel.id} in ${guild.name} (${guild.id})`)
        this.addFollowStatement.run({
            guildID: guild.id,
            channelID: channel.id,
            category,
            filter,
            addedOn: new Date().getTime(),
            addedBy
        })
    }

    private getFollowsStatement: SQLite.Statement
    private getFollowsInChannelStatement: SQLite.Statement
    getFollows(channel: Channel, category?: FollowCategory): Follower[] {
        if (category == undefined) {
            return this.getFollowsInChannelStatement.all({ channelID: channel.id })
        }
        return this.getFollowsStatement.all({
            channelID: channel.id,
            category
        })
    }

    private getFollowersStatement: SQLite.Statement
    getFollowers(category: string, filter = "*"): { channelID: string }[] {
        return this.getFollowersStatement.all({
            category,
            filter
        })
    }

    private followsStatement: SQLite.Statement
    follows(channel: Channel, category: FollowCategory, filter = "*"): boolean {
        return this.followsStatement.get({
            channelID: channel.id,
            filter,
            category
        }) !== undefined
    }


    private unfollowsStatement: SQLite.Statement
    unfollow(channel: Channel, category: FollowCategory, filter = "*"): void {
        Logger.info(`Unfollowing ${filter} in ${category} in ${channel.id}`)
        this.unfollowsStatement.run({
            channelID: channel.id,
            filter,
            category
        })
    }

    private dropChannelStatement: SQLite.Statement
    dropChannel(channelID: string): void {
        Logger.info(`Removing channel ${channelID}`)
        this.dropChannelStatement.run({
            channelID
        })
    }

    private dropChannelCategoryStatement: SQLite.Statement
    dropChannelCategory(channelID: string, category: FollowCategory): void {
        Logger.info(`Removing channel ${category} for ${channelID}`)
        this.dropChannelCategoryStatement.run({
            channelID,
            category
        })
    }

    private dropGuildStatement: SQLite.Statement
    dropGuild(guildID: string): void {
        Logger.info(`Removing guild ${guildID}`)
        this.dropGuildStatement.run({
            guildID
        })
    }

    private followingStatement: SQLite.Statement
    following(guild: Guild): { category: FollowCategory, channelID: string, amount: number }[] {
        return this.followingStatement.all({
            guildID: guild.id
        })
    }

    async send(category: FollowCategory, content?: Snowflake, embed?: MessageEmbed, filters: string[] = ["*"]): Promise<(Message | Message[])[]> {
        if (!filters.includes("*")) filters = [...filters, "*"]
        let channels: string[] = []
        filters.forEach(filter => channels.push(...this.getFollowers(category, filter).map(k => k.channelID)))
        channels = channels.filter((val, ind) => channels.indexOf(val) === ind)

        Logger.info(`Sending ${category} for ${filters.join(",")} to ${channels.length} channels: ${content}`)
        const messages = (await sendToChannels(channels, content, embed)).filter((x): x is PromiseFulfilledResult<Message | Message[]> => x.status == "fulfilled").map(x => x.value).flat()

        for (const message of messages)
            if (message instanceof Message
                && message.channel.type === "GUILD_NEWS"
                && message.guild?.me
                && message.channel.permissionsFor(message.guild?.me)?.has("MANAGE_MESSAGES"))
                await message.crosspost()

        return messages
    }
}
