/**
 * GENEALOGY DATA MODEL - GEDCOM-szerű gráf-alapú struktúra
 * 
 * Ez a fájl definiálja a családfa adatstruktúráját.
 * A modell követi a GEDCOM 7.0 szabványt, ahol:
 * - INDIVIDUAL (Egyén): Egy személy az összes attribútumával
 * - FAMILY (Család): Egy kapcsolat/egység, ami összeköti a partnereket és gyerekeket
 */

// ==================== INDIVIDUAL (EGYÉN) ====================

interface Individual {
    id: string;                          // Egyedi azonosító (pl. "I001")
    
    // Alapadatok
    name: {
        firstName: string;
        middleName?: string;
        lastName: string;
        maidenName?: string;             // Leánykori név
        nickname?: string;
    };
    
    gender: 'male' | 'female' | 'other' | 'unknown';
    
    // Születés
    birth?: {
        date?: string;                   // ISO dátum
        dateApproximate?: boolean;
        place?: string;
        country?: string;
    };
    
    // Halálozás
    death?: {
        date?: string;
        dateApproximate?: boolean;
        place?: string;
        country?: string;
        cause?: string;
    };
    
    // Életrajzi adatok
    occupation?: string;
    education?: string;
    religion?: string;
    nationality?: string;
    biography?: string;
    notes?: string;
    
    // Média
    photoPath?: string;
    
    // ========== KAPCSOLATOK - EZ A KULCS! ==========
    
    /**
     * A család ID-ja, ahol ez a személy GYEREKKÉNT szerepel.
     * Minden személynek PONTOSAN EGY biológiai családja van.
     * NULL, ha a szülők ismeretlenek (pl. a fa gyökere).
     */
    parentFamilyId?: string;
    
    /**
     * OPCIONÁLIS: Örökbefogadó család
     */
    adoptiveFamilyId?: string;
    
    /**
     * Azon családok listája, ahol ez a személy SZÜLŐ/PARTNER.
     * Egy személynek akárhány kapcsolata lehet.
     */
    spouseFamilyIds: string[];
    
    // Metaadatok
    createdAt: string;
    updatedAt: string;
}


// ==================== FAMILY (CSALÁD/KAPCSOLAT) ====================

interface Family {
    id: string;                          // Egyedi azonosító (pl. "F001")
    
    // ========== PARTNEREK ==========
    /**
     * Partner1 és Partner2 - NEM "apa" és "anya"!
     * Így kezelhető: azonos nemű párok, ismeretlen szülő, stb.
     */
    partner1Id?: string;                 // Individual ID (lehet NULL: ismeretlen szülő)
    partner2Id?: string;                 // Individual ID (lehet NULL: egyedülálló szülő)
    
    // ========== KAPCSOLAT TÍPUSA ==========
    relationshipType: 
        | 'marriage'                     // Hivatalos házasság
        | 'civil_partnership'            // Bejegyzett élettársi kapcsolat
        | 'partnership'                  // Élettársi viszony
        | 'engagement'                   // Eljegyzés
        | 'relationship'                 // Kapcsolat (nem házasság)
        | 'one_night'                    // Alkalmi
        | 'unknown';                     // Ismeretlen
    
    // ========== STÁTUSZ ==========
    status:
        | 'active'                       // Jelenleg is fennáll
        | 'divorced'                     // Elvált
        | 'widowed'                      // Özvegy
        | 'separated'                    // Különélő
        | 'annulled'                     // Érvénytelenített
        | 'ended';                       // Egyéb ok miatt véget ért
    
    // ========== DÁTUMOK ==========
    startDate?: string;                  // Házasságkötés dátuma
    endDate?: string;                    // Válás/halálozás dátuma
    endReason?: string;                  // Befejezés oka
    
    // Helyszín
    marriagePlace?: string;
    
    // ========== GYEREKEK ==========
    /**
     * KRITIKUS: A gyerekek EHHEZ A CSALÁDHOZ tartoznak, nem közvetlenül a szülőkhöz!
     * Ez oldja meg a "három apától három gyerek" problémát.
     */
    childrenIds: string[];               // Individual ID-k listája
    
    /**
     * Gyerekek sorrendje és speciális jelölések
     */
    childrenMeta?: {
        [childId: string]: {
            birthOrder?: number;         // Születési sorrend
            isTwin?: boolean;            // Iker
            isAdopted?: boolean;         // Örökbefogadott ebbe a családba
        }
    };
    
    // Megjegyzések
    notes?: string;
}


// ==================== TELJES FA STRUKTÚRA ====================

interface GenealogyGraph {
    individuals: Map<string, Individual>;
    families: Map<string, Family>;
    
    // Metaadatok
    rootIndividualId?: string;           // A megjelenítés kiindulópontja
    createdAt: string;
    updatedAt: string;
}


// ==================== VIZUALIZÁCIÓS STRUKTÚRA ====================

/**
 * A rendereléshez használt struktúra - Layered Graph Drawing
 */
interface VisNode {
    id: string;
    type: 'individual' | 'family';       // Személy vagy Család-csomópont
    data: Individual | Family;
    
    // Pozíció (Sugiyama/Elk.js által számított)
    x: number;
    y: number;
    
    // Generáció (rank) - 0 a legidősebb
    generation: number;
    
    // Vizuális tulajdonságok
    width: number;
    height: number;
}

interface VisEdge {
    id: string;
    sourceId: string;
    targetId: string;
    type: 
        | 'partner'                      // Partner1 <-> Family <-> Partner2
        | 'parent-child'                 // Family -> Child
        | 'adoptive';                    // Örökbefogadás (szaggatott)
    
    // Opcionális metaadatok
    isDeceased?: boolean;                // Szürke/halványított vonal
}

interface VisGraph {
    nodes: VisNode[];
    edges: VisEdge[];
}


// ==================== ALGORITMUS PSZEUDOKÓD ====================

/**
 * PSZEUDOKÓD: Gráf bejárás szülőktől a gyerekekig
 * 
 * function traverseDescendants(individualId: string, graph: GenealogyGraph): Individual[] {
 *     const individual = graph.individuals.get(individualId);
 *     const descendants: Individual[] = [];
 *     
 *     // Minden család, ahol ez a személy szülő
 *     for (const familyId of individual.spouseFamilyIds) {
 *         const family = graph.families.get(familyId);
 *         
 *         // Minden gyerek ebben a családban
 *         for (const childId of family.childrenIds) {
 *             const child = graph.individuals.get(childId);
 *             descendants.push(child);
 *             
 *             // Rekurzív: a gyerek leszármazottai
 *             descendants.push(...traverseDescendants(childId, graph));
 *         }
 *     }
 *     
 *     return descendants;
 * }
 * 
 * function traverseAncestors(individualId: string, graph: GenealogyGraph): Individual[] {
 *     const individual = graph.individuals.get(individualId);
 *     const ancestors: Individual[] = [];
 *     
 *     if (!individual.parentFamilyId) return ancestors;
 *     
 *     const parentFamily = graph.families.get(individual.parentFamilyId);
 *     
 *     // Mindkét szülő hozzáadása
 *     if (parentFamily.partner1Id) {
 *         const parent1 = graph.individuals.get(parentFamily.partner1Id);
 *         ancestors.push(parent1);
 *         ancestors.push(...traverseAncestors(parent1.id, graph));
 *     }
 *     if (parentFamily.partner2Id) {
 *         const parent2 = graph.individuals.get(parentFamily.partner2Id);
 *         ancestors.push(parent2);
 *         ancestors.push(...traverseAncestors(parent2.id, graph));
 *     }
 *     
 *     return ancestors;
 * }
 * 
 * function detectHalfSiblings(individualId: string, graph: GenealogyGraph): Individual[] {
 *     const individual = graph.individuals.get(individualId);
 *     if (!individual.parentFamilyId) return [];
 *     
 *     const parentFamily = graph.families.get(individual.parentFamilyId);
 *     const halfSiblings: Individual[] = [];
 *     
 *     // Mindkét szülő összes családja
 *     const parentIds = [parentFamily.partner1Id, parentFamily.partner2Id].filter(Boolean);
 *     
 *     for (const parentId of parentIds) {
 *         const parent = graph.individuals.get(parentId);
 *         
 *         for (const familyId of parent.spouseFamilyIds) {
 *             if (familyId === individual.parentFamilyId) continue; // Saját család kihagyása
 *             
 *             const otherFamily = graph.families.get(familyId);
 *             for (const childId of otherFamily.childrenIds) {
 *                 halfSiblings.push(graph.individuals.get(childId));
 *             }
 *         }
 *     }
 *     
 *     return halfSiblings;
 * }
 */


// ==================== EXPORT ====================

export type { Individual, Family, GenealogyGraph, VisNode, VisEdge, VisGraph };
