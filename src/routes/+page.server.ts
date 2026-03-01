import { listSkills } from "$lib/server/skills"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async() => {
    return { skills: await listSkills() }
}