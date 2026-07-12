import {InMemoryRecentProjectsRepository} from "../../../cli/studio/InMemoryRecentProjectsRepository.js";
import type {RecentProjectEntry} from "../../../cli/studio/RecentProjectEntry.js";

function entry(projectRoot: string, name = "Game"): RecentProjectEntry {
    return {projectRoot, name, openedAt: new Date().toISOString()};
}

describe("InMemoryRecentProjectsRepository", () => {
    it("starts empty", async () => {
        const repository = new InMemoryRecentProjectsRepository();

        expect(await repository.list()).toEqual([]);
    });

    it("lists added entries most-recent-first", async () => {
        const repository = new InMemoryRecentProjectsRepository();

        await repository.add(entry("/a"));
        await repository.add(entry("/b"));

        expect((await repository.list()).map((e) => e.projectRoot)).toEqual(["/b", "/a"]);
    });

    it("de-duplicates by projectRoot, moving the re-added entry to the front", async () => {
        const repository = new InMemoryRecentProjectsRepository();

        await repository.add(entry("/a", "Game A"));
        await repository.add(entry("/b", "Game B"));
        await repository.add(entry("/a", "Game A renamed"));

        const list = await repository.list();
        expect(list.map((e) => e.projectRoot)).toEqual(["/a", "/b"]);
        expect(list[0].name).toBe("Game A renamed");
    });

    it("caps the list at 10 entries", async () => {
        const repository = new InMemoryRecentProjectsRepository();

        for (let i = 0; i < 15; i++) {
            await repository.add(entry(`/project-${i}`));
        }

        const list = await repository.list();
        expect(list).toHaveLength(10);
        expect(list[0].projectRoot).toBe("/project-14");
    });
});
