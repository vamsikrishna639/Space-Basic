import { Schema, model, type Types } from 'mongoose';
import { FLOOR_CODE_PATTERN, ROOM_CODE_PATTERN } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// Data-driven hostel layout: hostels -> floors -> rooms (docs/schemas.md §1.7). All tenant-scoped.

export interface Hostel { _id: Types.ObjectId; institutionId: Types.ObjectId; name: string; code: string; order: number }
const hostelSchema = new Schema<Hostel>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9]{1,6}$/ },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
hostelSchema.index({ institutionId: 1, code: 1 }, { unique: true });
hostelSchema.plugin(tenantScope);
export const HostelModel = model<Hostel>('Hostel', hostelSchema, 'hostels');

export interface Floor {
  _id: Types.ObjectId; institutionId: Types.ObjectId; hostelId: Types.ObjectId;
  code: string; name: string; order: number; roomNumberMin: number; roomNumberMax: number; bedsPerRoom: number;
}
const floorSchema = new Schema<Floor>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    hostelId: { type: Schema.Types.ObjectId, required: true, ref: 'Hostel' },
    code: { type: String, required: true, uppercase: true, match: FLOOR_CODE_PATTERN },
    name: { type: String, required: true, maxlength: 60 },
    order: { type: Number, default: 0 },
    roomNumberMin: { type: Number, required: true, min: 1, max: 999 },
    roomNumberMax: { type: Number, required: true, min: 1, max: 999 },
    bedsPerRoom: { type: Number, required: true, min: 1, max: 12, default: 3 },
  },
  { timestamps: true, versionKey: false },
);
floorSchema.pre('validate', function () {
  if (this.roomNumberMax < this.roomNumberMin) this.invalidate('roomNumberMax', 'roomNumberMax must be >= roomNumberMin');
});
floorSchema.index({ institutionId: 1, hostelId: 1, code: 1 }, { unique: true });
floorSchema.plugin(tenantScope);
export const FloorModel = model<Floor>('Floor', floorSchema, 'floors');

export interface Room {
  _id: Types.ObjectId; institutionId: Types.ObjectId; hostelId: Types.ObjectId; floorId: Types.ObjectId;
  number: number; code: string; beds: number;
}
const roomSchema = new Schema<Room>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    hostelId: { type: Schema.Types.ObjectId, required: true, ref: 'Hostel' },
    floorId: { type: Schema.Types.ObjectId, required: true, ref: 'Floor' },
    number: { type: Number, required: true, min: 1, max: 999 },
    code: { type: String, required: true, uppercase: true, match: ROOM_CODE_PATTERN },
    beds: { type: Number, required: true, min: 1, max: 12 },
  },
  { timestamps: true, versionKey: false },
);
roomSchema.index({ institutionId: 1, code: 1 }, { unique: true });
roomSchema.index({ institutionId: 1, floorId: 1, number: 1 });
roomSchema.plugin(tenantScope);
export const RoomModel = model<Room>('Room', roomSchema, 'rooms');
