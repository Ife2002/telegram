import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, Mint } from '@solana/spl-token';

interface MintResult {
    mintInfo: Mint;
    programType: 'spl-token' | 'token-2022';
}

export async function getSmartMint(
    connection: Connection, 
    mint: PublicKey,
    commitment: Commitment = 'finalized'
): Promise<MintResult> {
    
    const accountInfo = await connection.getAccountInfo(mint);
    if (!accountInfo) {
        throw new Error('Mint account does not exist');
    }
    try {
        const mintInfo = await getMint(
            connection,
            mint,
            commitment,
            TOKEN_PROGRAM_ID
        );
        return {
            mintInfo,
            programType: 'spl-token'
        };
    } catch (splError) {
        // Only try Token-2022 if the specific error indicates wrong program
        if (splError) {
            try {
                const mintInfo = await getMint(
                    connection,
                    mint,
                    commitment,
                    TOKEN_2022_PROGRAM_ID
                );
                return {
                    mintInfo,
                    programType: 'token-2022'
                };
            } catch (token22Error) {
                throw new Error(
                    `Invalid mint: Neither SPL Token nor Token-2022 program. ` +
                    `SPL Token error: ${splError.message}. ` +
                    `Token-2022 error: ${token22Error.message}`
                );
            }
        }
        // For other types of errors, throw the original error
        throw new Error(`SPL Token error: ${splError.message}`);
    }
}

