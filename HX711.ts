/**
 * MakeCode editor extension for HX711 Differential 24 bit A/D for weight sensors
 * by David Ferrer - (c)2019
 * MIT License
  */

//% block="HX711" weight=100 color=#ff8f3f icon="\uf24e"
namespace HX711 {
    let PD_SCK = DigitalPin.P0;
    let DOUT = DigitalPin.P1;
    let GAIN: number = 0.0;
    let OFFSET: number = 0;	// used for tare weight
    let SCALE: number = 1;	// used to return weight in grams, kg, ounces, whatever

    /**
      * Query data from HX711 module. 
      * It is also recommended to wait 1 or 2 seconds between each query.
      */

    /**
     * Set SCK and DOUT pins
     * @param pinPD_SCK pin at which the SCK line is connected
     * @param pinDOUT pin at which the DOUT line is connected
     */
    //% blockId="HX711_BEGIN" block="begin with ClockPin %pinPD_SCK and DataPin %pinDOUT"
    //% weight=100 blockGap=8 pinPD_SCK.defl=DigitalPin.P0 pinDOUT.defl=DigitalPin.P1
    export function begin(pinPD_SCK: DigitalPin, pinDOUT: DigitalPin) {
        PD_SCK = pinPD_SCK;
        DOUT = pinDOUT;
        set_gain(128) //default gain 128
    }

    export function is_ready(): boolean {
        return (pins.digitalReadPin(DOUT) == 0)
    }

    export function set_gain(gain: number) {
        switch (gain) {
            case 128:		// channel A, gain factor 128
                GAIN = 1
                break
            case 64:		// channel A, gain factor 64
                GAIN = 3
                break
            case 32:		// channel B, gain factor 32
                GAIN = 2
                break
        }
        pins.digitalWritePin(PD_SCK, 0)
        read()
    }

    export function shiftInSlow(bitOrder: number): number {
        let value: number = 0
        let i: number

        for (i = 0; i < 8; ++i) {
            pins.digitalWritePin(PD_SCK, 1)
            control.waitMicros(1)
            if (bitOrder == 0)
                value |= pins.digitalReadPin(DOUT) << i;
            //value = value + (pins.digitalReadPin(DOUT) * 2 ^ i)
            else
                value |= pins.digitalReadPin(DOUT) << (7 - i);
            //value = value + (pins.digitalReadPin(DOUT) * 2 ^ (7 - i))
            //value = value | (pins.digitalReadPin(DOUT) << (7 - i))
            pins.digitalWritePin(PD_SCK, 0)
            control.waitMicros(1)
        }
        return value
    }


    //% blockId="HX711_READ" block="read raw data"
    //% weight=80 blockGap=8
    export function read(): number {

        // Wait for the chip to become ready.
        wait_ready(0)

        // Define structures for reading data into.
        let value: number = 0
        let data: number[] = [0, 0, 0]
        let filler: number = 0x00

        // Protect the read sequence from system interrupts.  If an interrupt occurs during
        // the time the PD_SCK signal is high it will stretch the length of the clock pulse.
        // If the total pulse time exceeds 60 uSec this will cause the HX711 to enter
        // power down mode during the middle of the read sequence.  While the device will
        // wake up when PD_SCK goes low again, the reset starts a new conversion cycle which
        // forces DOUT high until that cycle is completed.
        //
        // The result is that all subsequent bits read by shiftIn() will read back as 1,
        // corrupting the value returned by read().  The ATOMIC_BLOCK macro disables
        // interrupts during the sequence and then restores the interrupt mask to its previous
        // state after the sequence completes, insuring that the entire read-and-gain-set
        // sequence is not interrupted.  The macro has a few minor advantages over bracketing
        // the sequence between `noInterrupts()` and `interrupts()` calls.

        // Pulse the clock pin 24 times to read the data.
        //LSBFIRST = 0,
        //MSBFIRST = 1
        //data[2] = shiftInSlow(DOUT, PD_SCK, MSBFIRST)
        //data[1] = shiftInSlow(DOUT, PD_SCK, MSBFIRST)
        //data[0] = shiftInSlow(DOUT, PD_SCK, MSBFIRST)

        data[2] = shiftInSlow(1)
        data[1] = shiftInSlow(1)
        data[0] = shiftInSlow(1)

        // Set the channel and the gain factor for the next reading using the clock pin.
        let i: number = 0
        for (i = 0; i < GAIN; i++) {
            pins.digitalWritePin(PD_SCK, 1)
            control.waitMicros(1)
            pins.digitalWritePin(PD_SCK, 0)
            control.waitMicros(1)
        }

        // Replicate the most significant bit to pad out a 32-bit signed integer
        if (data[2] & 0x80) {
            filler = 0xFF
        } else {
            filler = 0x00
        }
        data[2] = data[2] ^ 0x80 //shift MSB

        // Construct a 32-bit signed integer
        value = ((filler) << 24 | (data[2]) << 16 | (data[1]) << 8 | (data[0]))
        //value = ((filler * 16777216) + (data[2] * 65536) + (data[1] * 256) + (data[0]))

        return (value)
    }

    export function wait_ready(delay_ms: number) {
        // Wait for the chip to become ready.
        // This is a blocking implementation and will
        // halt the sketch until a load cell is connected.
        while (!is_ready()) {

            basic.pause(delay_ms)
        }
    }

    export function wait_ready_retry(retries: number, delay_ms: number): boolean {
        // Wait for the chip to become ready by
        // retrying for a specified amount of attempts
        let count: number = 0
        while (count < retries) {
            if (is_ready()) {
                return true
            }
            basic.pause(delay_ms)
            count++
        }
        return false
    }

    export function wait_ready_timeout(timeout: number, delay_ms: number): boolean {
        // Wait for the chip to become ready until timeout.
        // https://github.com/bogde/HX711/pull/96
        let millisStarted: number = input.runningTime()
        while (input.runningTime() - millisStarted < timeout) {
            if (is_ready()) {
                return true
            }
            basic.pause(delay_ms)
        }
        return false
    }

    //% blockId="HX711_READ_AVERAGE" block="read raw average %times times"
    //% weight=80 blockGap=8 times.defl=10
    export function read_average(times: number = 10): number {
        let sum: number = 0
        let i: number = 0
        for (i = 0; i < times; i++) {
            sum += read()
            basic.pause(0)
        }
        return sum / times
    }

    //% blockId="HX711_GET_UNITS" block="get scaled average %times times"
    //% weight=80 blockGap=8 times.defl=10
    export function get_units(times: number = 10): number {
        let valor: number = 0
        //let valor_string: string = ""
        //let ceros: string = ""
        
        valor = (read_average(times) - OFFSET) / SCALE
        /* if (Math.abs(Math.round((valor - Math.trunc(valor)) * 100)).toString().length == 0) {
            ceros = "00"
         } else if (Math.abs(Math.round((valor - Math.trunc(valor)) * 100)).toString().length == 1) {
            ceros = "0"
         }
    valor_string = "" + Math.trunc(valor).toString() + "." + ceros + Math.abs(Math.round((valor - Math.trunc(valor)) * 100)).toString()
     */
        return valor
    }

    //% blockId="HX711_TARE" block="tare (set zero)"
    //% weight=95 blockGap=8
    export function tare() {
        let avg: number = 0
        avg = read_average(10)
        set_offset(avg)
    }

    //% blockId="HX711_SET_SCALE" block="set scale with known weight %weight"
    //% weight=90 blockGap=8 weight.defl=10
    export function set_scale(weight: number) {
        let avg: number = 0
        avg = read_average(10)     
        SCALE = (avg - OFFSET) / weight
    }

    //% blockId="HX711_SET_OFFSET" block="set offset %offset"
    //% weight=90 blockGap=8
    export function set_offset(offset: number) {
        OFFSET = offset
    }

}/*namespace*/
