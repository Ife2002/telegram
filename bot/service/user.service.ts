import User,{UserType} from "storage/db/models/user"

export class UserService {
    async getUserByTelegramId(id: string): Promise<UserType> {
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
}}
