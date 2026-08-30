import { describe, expect, it } from "vitest";
import { blocActions } from "./ecriture";

describe("blocActions", () => {
    it("liste les actions autorisées pour un rôle sales", () => {
        const bloc = blocActions("SALES");
        expect(bloc).toContain("ACTIONS D'ÉCRITURE AUTORISÉES POUR LE RÔLE SALES");
        expect(bloc).toContain("CREATE_CUSTOMER");
        expect(bloc).toContain("UPDATE_CUSTOMER");
    });

    it("bloque les rôles sans écriture autorisée", () => {
        const bloc = blocActions("ADMIN");
        expect(bloc).toContain("Le rôle ADMIN n'est autorisé à effectuer aucune action d'écriture");
    });
});
