import { Schema, model, Document } from 'mongoose';


export interface PumpType extends Document {
   address: string,
   bonding_curve: string
}