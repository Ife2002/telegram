import User,{UserType} from "storage/db/user.model"
import { VaultService } from "./vault.service"
import Wallet, { WalletType } from "storage/db/wallet.model";

export class UserService {
  private vaultservice: VaultService;

  constructor() {
    this.vaultservice = new VaultService();
  };

  ///find a way to make this atomic
  async createDefaultUserWallet() {
    // create wallet
    try {
      const wallet = await this.vaultservice.createWallet()
      const dbWallet = new Wallet({
        address: wallet.publicKey,
        encryptedPrivateKey: wallet.encryptedPrivateKey,
      })
      await dbWallet.save()
      return dbWallet
    } catch(err) {
       console.error(err)
    }
    
  }

    async getUserByTelegramId(id: string): Promise<UserType> {
      try {
        let user = await User.findOne({ telegramId: id }).populate('wallet')
        if (user) {
          if (user.blacklisted) {
            return null
          }
    
          /* if (!user.wallet) {
            user.wallet = await createDefaultUserWallet()
            await user.save()
          } */
    
          return user
        }
      } catch(err) {
        console.log(err)
      }
    }
    
    async getUserWalletByTelegramId(id: string): Promise<WalletType> {
      try {
        const user = await User
          .findOne({ telegramId: id })
          .populate<{ wallet: WalletType }>('wallet')
          .lean();

        if (user) {
          if (user.blacklisted) {
            return null
          }
    
          /* if (!user.wallet) {
            user.wallet = await createDefaultUserWallet()
            await user.save()
          } */
    
          return user.wallet as WalletType
        }
      } catch(err) {
        console.error(err)
      }
    }
  }
