import test from "ava";
import { MongoMemoryServer } from "mongodb-memory-server";

import Bot from "./../build/bot.js"
import * as Discord from "discord.js";
import * as MockApi from "./mockApi.js";

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const awaitReply = (bot, message, channel, sendPrefix = true) => new Promise(async (resolve, reject) => {
	message.channel.addListener("__testMessageSent", resolve, { once: true });
	if (sendPrefix) message.content = process.env.DEFAULT_PREFIX + message.content;
	await bot.messageCreate(message);
	setTimeout(() => reject("no reply"), 1000);
})

test.serial.before("start database", async t => {
	t.context.mongo = await MongoMemoryServer.create();

	process.env.MONGO_URL = t.context.mongo.getUri();
	process.env.owner = "226230010132824066";
	process.env.DEFAULT_PREFIX = "%";
	process.env.DEFAULT_LOCALE = "en-AU";
	process.env.DEFAULT_TIMEZONE = "Australia/Sydney";
})

test.beforeEach("create new bot instance", async t => {
	t.context.client = new MockApi.Client();
	t.context.bot = new Bot(t.context.client, `strawbean-test-${Math.random().toString(24).slice(2)}`);

	await t.context.bot.ready();

	//we don't want any library intervals to run automatically for tests
	for (var curr in t.context.bot.intervals) {
		clearInterval(t.context.bot.intervals[curr]);
		delete t.context.bot.intervals[curr];
	}

	t.true(t.context.bot.Env.ready);

	t.context.adminUser = new MockApi.GuildMember();
	t.context.adminUser.permissions = new Discord.Permissions(Discord.Permissions.ALL);

	t.context.standardUser = new MockApi.GuildMember();
})

test.afterEach.always("clean database", async t => {
	const collections = [
		"reminders",
		"users",
		"guilds",
	];

	for (var collection of collections) {
		await t.context.bot.mongo.db(process.env.DB_NAME).collection(collection).deleteMany({})
	}
})

const testReminder = async (t, message, expected, repeating = false) => {
	//timezone stuff
	if (t.context.bot.Env.libs.language.isDst(new Date()) &&
		!t.context.bot.Env.libs.language.isDst(expected))
		expected.setHours(expected.getHours() - 1);
	else if (!t.context.bot.Env.libs.language.isDst(new Date()) &&
		t.context.bot.Env.libs.language.isDst(expected))
		expected.setHours(expected.getHours() + 1);

	const reply = await awaitReply(t.context.bot, message, true);
	if (!reply.embeds) return t.fail(`message did not contain embed : ${reply}`)

	const reminders = await t.context.bot.Env.libs.reminders.getAll(message.author.id);
	const Id = parseInt(reply.embeds[0].title.split(" ")[0].split("#")[1]);	//lol
	const reminder = reminders.find(x => x.remove_id === Id - 1);
	t.assert(reminder, `reminder does not exist : ${message.content}`);
	t.assert(Math.abs(reminder.time - expected) < 5 * 1000, 	//5 seconds leeway
		`received ${new Date(reminder.time).toLocaleString()}, expected ${expected.toLocaleString()} : ${message.content}`);
	t.assert(repeating ? reminder.setTime - reminder.time : true, `does not repeat : ${message.content}`);
}

test("remindme test in(* rand) [time]", async t => {
	const units = {
		year: 365.25 * 24 * 60 * 60 * 1000,
		month: (365.25 / 12) * 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		hour: 60 * 60 * 1000,
		minute: 60 * 1000,
	};

	for (var unit in units) {
		for (var i = 1; i <= 12; i++) {
			const expected = new Date(Date.now() + i * units[unit]);

			const msg = new MockApi.Message(`remindme test${" in ".repeat(Math.floor(Math.random() * 10) + 1)}${i} ${unit}`);
			await testReminder(t, msg, expected);
		}
	}
})

test("remindme test at(* rand) [date]", async t => {
	var now = new Date();
	for (var year = now.getFullYear(); year < now.getFullYear() + 1; year++) {
		for (var month = 0; month < 12; month++) {
			const thisMonth = new Date(year, month + 1, -1);
			for (var day = 1; day <= thisMonth.getDate(); day++) {

				var expected = new Date(year, month, day, new Date().getHours(), new Date().getMinutes(), new Date().getSeconds());
				while (expected.valueOf() < Date.now() - 60 * 1000) {
					//strawbean should set the reminder date to next day if it's in the past
					expected.setDate(expected.getDate() + 1);
				}

				const msg = new MockApi.Message(`remindme test${" at ".repeat(Math.floor(Math.random() * 10) + 1)}${day}/${month + 1}/${year}`);
				await testReminder(t, msg, expected);
			}
		}
	}
})

test("remindme test at(* rand) [date] [time]", async t => {
	var now = new Date();
	for (var month = now.getMonth(); month < now.getMonth() + 1; month++) {
		const thisMonth = new Date(now.getFullYear(), month + 1, -1);
		for (var day = 1; day <= thisMonth.getDate(); day++) {

			for (var hour = 0; hour < 24; hour++) {
				var expected = new Date(now.getFullYear(), month, day, hour, 0, 0);
				while (expected.valueOf() < Date.now() - 60 * 1000) {
					//strawbean should set the reminder date to next day if it's in the past
					expected.setDate(expected.getDate() + 1);
				}

				var inputString = expected.toLocaleString(
					process.env.DEFAULT_LOCALE,
					{
						timeZone: process.env.DEFAULT_TIMEZONE,
						dateStyle: "short",
						timeStyle: "short"
					}
				);
				inputString = inputString.split(",").join("")
				const msg = new MockApi.Message(`remindme test${" at ".repeat(Math.floor(Math.random() * 10) + 1)}${inputString}`);
				await testReminder(t, msg, expected);
			}
		}
	}
})

test("remindme test at(* rand) [date] [time] in(* rand) [time]", async t => {
	const units = {
		year: 365.25 * 24 * 60 * 60 * 1000,
		month: (365.25 / 12) * 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		hour: 60 * 60 * 1000,
		minute: 60 * 1000,
	};

	var now = new Date();
	for (var unit in units) {
		for (var i = 1; i <= 12; i++) {
			for (var month = now.getMonth(); month < now.getMonth() + 1; month++) {
				const thisMonth = new Date(now.getFullYear(), month + 1, -1);

				var expected = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
				while (expected.valueOf() < Date.now() - 60 * 1000) {
					//strawbean should set the reminder date to next day if it's in the past
					expected.setDate(expected.getDate() + 1);
				}

				var inputString = expected.toLocaleString(
					process.env.DEFAULT_LOCALE,
					{
						timeZone: process.env.DEFAULT_TIMEZONE,
						dateStyle: "short",
						timeStyle: "short"
					}
				);
				inputString = inputString.split(",").join("")
				const msg = new MockApi.Message(
					`remindme test${" at ".repeat(Math.floor(Math.random() * 10) + 1)}${inputString}` +
					`${" in ".repeat(Math.floor(Math.random() * 10) + 1)}${i} ${unit}`
				);
				await testReminder(t, msg, new Date(expected.valueOf() + i * units[unit]));
			}
		}
	}
})

test("remindme test [unit]", async t => {
	const units = {
		tomorrow: 24 * 60 * 60 * 1000,
		hourly: 60 * 60 * 1000,
		daily: 24 * 60 * 60 * 1000,
		weekly: 7 * 24 * 60 * 60 * 1000,
		fortnightly: 2 * 7 * 24 * 60 * 60 * 1000,
		monthly: 30 * 24 * 60 * 60 * 1000,
		yearly: 365 * 24 * 60 * 60 * 1000,
	};

	for (var unit in units) {
		const expected = new Date(Date.now() + units[unit]);

		const msg = new MockApi.Message(`remindme test ${unit}`);
		await testReminder(t, msg, expected, unit === "tomorrow" ? false : true);
	}
})

test("remove all", async t => {
	const user = new MockApi.GuildMember();
	for (var i = 0; i < 10; i++) {
		await awaitReply(t.context.bot, new MockApi.Message("remindme test in 1 year", user));
	}

	const msg = new MockApi.Message("remove all", user);
	const reply = await awaitReply(t.context.bot, msg);

	await wait(1000);

	const reminders = await t.context.bot.Env.libs.reminders.getAll(msg.author.id);
	if (reminders.length) debugger;
	t.falsy(reminders.length, "not all reminders were deleted")
})

test("rename latest example reminder", async t => {
	const user = new MockApi.GuildMember();
	for (var i = 0; i < 10; i++) {
		await awaitReply(t.context.bot, new MockApi.Message("remindme test in 1 year", user));
		await wait(100);
		await awaitReply(t.context.bot, new MockApi.Message("rename latest example reminder", user));
		await wait(100);
	}

	await wait(1000);

	const reminders = await t.context.bot.Env.libs.reminders.getAll(user.id);
	for (var reminder of reminders) {
		t.is(reminder.name, "example reminder", "reminder was not renamed");
	}
})

test("rename 1 example reminder", async t => {
	const user = new MockApi.GuildMember();
	await awaitReply(t.context.bot, new MockApi.Message("remindme test in 1 year", user));
	await awaitReply(t.context.bot, new MockApi.Message("rename 1 example reminder", user));
	const reminders = await t.context.bot.Env.libs.reminders.getAll(user.id);
	t.is(reminders[0].name, "example reminder", "reminder was not renamed");
})

test(";;;;;;;;;;;;;;;;;;;", async t => {
	try {
		await awaitReply(t.context.bot, new MockApi.Message(";;;;;;;;;;;;;;;;;;;"));
	}
	catch (e) {
		return t.pass();
	}
	t.fail();
})

test("cannot chain help, list", async t => {
	const reply = await awaitReply(
		t.context.bot,
		new MockApi.Message("help; list; help; list; help; list;")
	)
	t.is(reply.embeds.length, 2)
})

test("time latest in 1 week", async t => {
	const user = new MockApi.GuildMember();
	await awaitReply(t.context.bot, new MockApi.Message("remindme test in 5 years", user));

	await testReminder(
		t,
		new MockApi.Message("time latest in 1 week", user),
		new Date(new Date().setDate(new Date().getDate() + 7)),
		false,
	)
})

test.after("stop server", async t => {
	await wait(1000);
	await t.context.mongo.stop();
})